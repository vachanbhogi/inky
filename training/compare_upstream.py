"""Compare upstream FormulaNet ONNX (from the HF snapshot) vs our local LoRA-merged
export on the same CROHME samples, through identical preprocessing.

Upstream:  encoder (B,C,H,W) -> (B,S,2048), decoder has KV-cache present outputs.
Local:     encoder (B,3,384,384) -> (B,144,384), decoder logits only (no cache).

Run: uv run --with onnxruntime --with numpy --with tokenizers --with huggingface_hub training/compare_upstream.py
"""

import sys
import zipfile
from pathlib import Path

import numpy as np
import onnxruntime as ort

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rasterizer import rasterize_strokes  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
LOCAL = REPO / "public" / "models"
SNAP = (
	Path.home()
	/ ".cache/huggingface/hub/models--alephpi--FormulaNet/snapshots"
	/ "b2668efe5112082846fde4d446b9bfaab3989533"
)
UP = SNAP / "onnx"
ZIP = REPO / "training" / "crohme_data" / "CROHME_full_v2.zip"
MAX_NEW = 128


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


def greedy_nocache(enc_sess, dec_sess, px, bos, eos, enc_input, enc_output, enc_hidden):
	"""Full re-encode each step (matches our local export: no KV cache)."""
	h = enc_sess.run(None, {enc_input: px})[0]
	ids = [[bos]]
	for _ in range(MAX_NEW):
		logits = dec_sess.run(
			None,
			{"input_ids": np.array(ids, dtype=np.int64), enc_hidden: h},
		)[0]
		nxt = int(logits[0, -1].argmax())
		if nxt == eos:
			break
		ids[0].append(nxt)
	return ids[0][1:]


def greedy_cache(enc_sess, dec_sess, px, bos, eos, enc_input, enc_output, enc_hidden):
	"""Decode upstream decoder. It exposes present.* outputs but (as exported)
	only accepts input_ids + encoder_hidden_states — so re-encode each step
	unless the session actually exposes past_key_values inputs."""
	h = enc_sess.run(None, {enc_input: px})[0]
	dec_inputs = {i.name for i in dec_sess.get_inputs()}
	feedable_cache = any(n.startswith("past_key_values") for n in dec_inputs)
	past = None
	ids = [bos]
	for _ in range(MAX_NEW):
		feeds = {
			"input_ids": np.array([ids], dtype=np.int64),
			enc_hidden: h,
		}
		if feedable_cache and past:
			for k, v in past.items():
				if k in dec_inputs:
					feeds[k] = v
		outs = dec_sess.run(None, feeds)
		logits = outs[0]
		if feedable_cache:
			names = [o.name for o in dec_sess.get_outputs()]
			past = {
				names[i]: outs[i]
				for i in range(1, len(outs))
				if names[i].startswith("present.")
			}
		nxt = int(logits[0, -1].argmax())
		if nxt == eos:
			break
		ids.append(nxt)
	return ids[1:]


def main():
	from tokenizers import Tokenizer

	tok = Tokenizer.from_pretrained("alephpi/FormulaNet")
	bos, eos = tok.token_to_id("<s>"), tok.token_to_id("</s>")
	so = ort.SessionOptions()
	opts = {"sess_options": so, "providers": ["CPUExecutionProvider"]}

	up_enc = ort.InferenceSession(str(UP / "encoder_model.onnx"), **opts)
	up_dec = ort.InferenceSession(str(UP / "decoder_model.onnx"), **opts)
	lo_enc = ort.InferenceSession(str(LOCAL / "encoder.ort"), **opts)
	lo_dec = ort.InferenceSession(str(LOCAL / "decoder.ort"), **opts)

	up_enc_in = up_enc.get_inputs()[0].name
	up_dec_h = up_dec.get_inputs()[1].name

	print("upstream enc:", [(i.name, i.shape) for i in up_enc.get_inputs()])
	print("upstream dec:", [(i.name, i.shape) for i in up_dec.get_inputs()])

	with zipfile.ZipFile(ZIP) as z:
		candidates = sorted(n for n in z.namelist() if n.lower().endswith(".inkml"))
		samples = []
		for name in candidates:
			truth, strokes = parse_inkml(z.read(name))
			if truth and strokes:
				samples.append((truth, strokes))
				if len(samples) >= 10:
					break

	for truth, strokes in samples:
		rast = rasterize_strokes(strokes)[0]  # (1, 384, 384)
		px3 = np.repeat(rast[None], 3, axis=1)  # (1, 3, 384, 384)
		try:
			up_ids = greedy_cache(
				up_enc, up_dec, px3, bos, eos, up_enc_in, None, up_dec_h
			)
			up = tok.decode(up_ids, skip_special_tokens=True)
		except Exception as e:
			up = f"FAIL: {str(e)[:80]}"
		try:
			lo_ids = greedy_nocache(
				lo_enc, lo_dec, px3, bos, eos, "pixel_values", None,
				"encoder_hidden_states",
			)
			lo = tok.decode(lo_ids, skip_special_tokens=True)
		except Exception as e:
			lo = f"FAIL: {str(e)[:80]}"
		print(f"\ntruth:  {truth!r}")
		print(f"  up:   {up!r}")
		print(f"  lora: {lo!r}")


if __name__ == "__main__":
	main()
