"""Validate the exported ONNX encoder+decoder against CROHME ground truth.

This determines, definitively:
  1. whether the encoder wants 1 or 3 input channels,
  2. whether the Python rasterizer's normalization is correct,
  3. whether greedy decoding produces correct LaTeX.

Run: uv run --with onnxruntime --with numpy --with tokenizers training/validate_onnx.py
"""

import sys
import zipfile
from pathlib import Path

import numpy as np
import onnxruntime as ort

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rasterizer import rasterize_strokes  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
MODELS = REPO / "public" / "models"
ZIP = REPO / "training" / "crohme_data" / "CROHME_full_v2.zip"
TOKENIZER_ID = "alephpi/FormulaNet"


def parse_inkml(xml_bytes):
	# Mirrors data_loader.parse_inkml_string without importing torch/transformers.
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
	print("loading sessions...")
	enc = ort.InferenceSession(str(MODELS / "encoder.ort"), providers=["CPUExecutionProvider"])
	dec = ort.InferenceSession(str(MODELS / "decoder.ort"), providers=["CPUExecutionProvider"])
	print("enc in:", [(i.name, i.shape) for i in enc.get_inputs()])

	from tokenizers import Tokenizer

	tok = Tokenizer.from_pretrained(TOKENIZER_ID)
	bos, eos = tok.token_to_id("<s>"), tok.token_to_id("</s>")

	with zipfile.ZipFile(ZIP) as z:
		# Only the 2013/2014 splits carry in-file truth labels; scan until we
		# collect enough valid samples regardless of which split they're in.
		candidates = sorted(n for n in z.namelist() if n.lower().endswith(".inkml"))
		samples = []
		for name in candidates:
			truth, strokes = parse_inkml(z.read(name))
			if truth and strokes:
				samples.append((name, truth, strokes))
				if len(samples) >= 12:
					break
		ok = 0
		for name, truth, strokes in samples:
			rast = rasterize_strokes(strokes)[0]  # (1, 384, 384)

			results = {}
			for ch in (1, 3):
				px = np.repeat(rast[None], ch, axis=1)  # (1, C, 384, 384)
				try:
					h = enc.run(None, {"pixel_values": px})[0]
				except Exception as e:
					results[ch] = f"FAIL: {str(e)[:60]}"
					continue
				ids = [[bos]]
				for _ in range(128):
					logits = dec.run(None, {"input_ids": np.array(ids, dtype=np.int64), "encoder_hidden_states": h})[0]
					nxt = int(logits[0, -1].argmax())
					if nxt == eos:
						break
					ids[0].append(nxt)
				results[ch] = tok.decode(ids[0][1:], skip_special_tokens=True)
			print(f"\ntruth: {truth!r}")
			for ch in (1, 3):
				print(f"  ch={ch}: {results[ch]!r}")


if __name__ == "__main__":
	main()
