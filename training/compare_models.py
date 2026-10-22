"""Decisive comparison: base FormulaNet vs LoRA-finetuned, through the training preprocessing.

Answers: did the LoRA fine-tune help or hurt? Run the same CROHME samples through:
  1. base model (alephpi/FormulaNet, no adapter)
  2. LoRA-merged model (checkpoints/best_lora)
and print side-by-side against ground truth.

Run: uv run --with torch --with transformers --with peft training/compare_models.py
"""

import sys
import zipfile
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rasterizer import rasterize_strokes  # noqa: E402

MODEL_NAME = "alephpi/FormulaNet"
LORA = Path(__file__).resolve().parent / "checkpoints" / "best_lora"
ZIP = Path(__file__).resolve().parent / "crohme_data" / "CROHME_full_v2.zip"


def parse_inkml(xml_bytes):
	import xml.etree.ElementTree as ET

	try:
		root = ET.fromstring(xml_bytes)
	except Exception:
		return None, None
	truth = None
	for elem in root.iter():
		if elem.tag.endswith("annotation") and elem.attrib.get("type") == "truth":
			if elem.text:
				truth = elem.text.strip()
			break
	if not truth:
		return None, None
	if truth.startswith("$") and truth.endswith("$") and len(truth) >= 2:
		truth = truth[1:-1].strip()
	strokes = []
	for elem in root.iter():
		if elem.tag.endswith("trace") and not elem.tag.endswith(("traceGroup", "traceView")):
			raw = elem.text.strip() if elem.text else ""
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
	return (truth, strokes) if strokes else (None, None)


def main():
	device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
	print(f"device: {device}")

	from transformers import PreTrainedTokenizerFast, VisionEncoderDecoderModel

	tok = PreTrainedTokenizerFast.from_pretrained(MODEL_NAME)
	base = VisionEncoderDecoderModel.from_pretrained(MODEL_NAME).to(device).eval()

	lora_path = LORA
	use_lora = lora_path.exists()
	if use_lora:
		from peft import PeftModel

		lora = PeftModel.from_pretrained(base, str(lora_path)).merge_and_unload().eval()
	else:
		lora = base

	with zipfile.ZipFile(ZIP) as z:
		candidates = sorted(n for n in z.namelist() if n.lower().endswith(".inkml"))
		samples = []
		for name in candidates:
			truth, strokes = parse_inkml(z.read(name))
			if truth and strokes:
				samples.append((truth, strokes))
				if len(samples) >= 10:
					break

	@torch.no_grad()
	def gen(model, px):
		out = model.generate(px, max_new_tokens=128, num_beams=1)
		return tok.decode(out[0], skip_special_tokens=True)

	for truth, strokes in samples:
		px = torch.from_numpy(rasterize_strokes(strokes)).float().to(device)
		# the encoder patch-embed handles the 1->3 channel repeat internally in
		# PyTorch; verify shape expectations by just calling generate.
		r_base = gen(base, px)
		r_lora = gen(lora, px) if use_lora else r_base
		print(f"\ntruth: {truth!r}")
		print(f"  base: {r_base!r}")
		if use_lora:
			print(f"  lora: {r_lora!r}")


if __name__ == "__main__":
	main()
