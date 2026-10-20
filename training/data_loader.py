import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from augment_strokes import StrokeAugmentor
from rasterizer import rasterize_strokes
import torch
from torch.utils.data import DataLoader, Dataset
from transformers import PreTrainedTokenizerFast

DEFAULT_DATA_DIR = Path(__file__).resolve().parent / "crohme_data"
DEFAULT_ZIP_NAME = "CROHME_full_v2.zip"
FORMULANET_TOKENIZER_ID = "alephpi/FormulaNet"


def format_latex_for_tokenizer(s):
	if not s:
		return ""
	pat = r"\\[a-zA-Z]+|\\,|\\;|\\!|\\ |[^\s]"
	return " ".join(re.findall(pat, s))


def parse_inkml_string(inkml_content):
	try:
		root = ET.fromstring(inkml_content)
	except Exception:
		return None

	truth = None
	for elem in root.iter():
		if elem.tag.endswith("annotation") and elem.attrib.get("type") == "truth":
			if elem.text:
				truth = elem.text.strip()
			break

	if not truth:
		return None

	if truth.startswith("$") and truth.endswith("$") and len(truth) >= 2:
		truth = truth[1:-1].strip()

	strokes = []
	for elem in root.iter():
		if (
			elem.tag.endswith("trace")
			and not elem.tag.endswith("traceGroup")
			and not elem.tag.endswith("traceView")
		):
			raw = elem.text.strip() if elem.text else ""
			if not raw:
				continue
			pts = []
			for pt in raw.split(","):
				c = pt.strip().split()
				if len(c) >= 2:
					try:
						pts.append((float(c[0]), float(c[1])))
					except ValueError:
						continue
			if pts:
				strokes.append(pts)

	return (strokes, truth) if strokes else None


class HMEDataset(Dataset):
	def __init__(
		self, split="train", zip_path=None, augment=True, tokenizer=None, max_target_len=256
	):
		self.split = split
		self.augment = augment
		self.max_target_len = max_target_len
		self.zip_path = Path(zip_path or (DEFAULT_DATA_DIR / DEFAULT_ZIP_NAME))
		self.tokenizer = tokenizer or PreTrainedTokenizerFast.from_pretrained(
			FORMULANET_TOKENIZER_ID
		)
		self.augmentor = StrokeAugmentor() if augment else None
		self.samples = []

		if self.zip_path.exists():
			with zipfile.ZipFile(self.zip_path, "r") as z:
				for name in z.namelist():
					if name.endswith(".inkml") and (
						"train" in name if split == "train" else "test" in name
					):
						self.samples.append(z.read(name).decode("utf-8", errors="ignore"))

	def __len__(self):
		return len(self.samples)

	def __getitem__(self, idx):
		parsed = parse_inkml_string(self.samples[idx])
		if not parsed:
			return self.__getitem__((idx + 1) % len(self.samples))

		strokes, latex = parsed
		if self.augment and self.augmentor:
			strokes = self.augmentor(strokes)

		px = torch.from_numpy(rasterize_strokes(strokes)).float()
		tok = self.tokenizer(
			format_latex_for_tokenizer(latex),
			max_length=self.max_target_len,
			padding="max_length",
			truncation=True,
			return_tensors="pt",
		)
		return {"pixel_values": px.squeeze(0), "labels": tok["input_ids"].squeeze(0)}
