import sys
from pathlib import Path
import torch
from transformers import VisionEncoderDecoderModel
from peft import PeftModel


def export(lora="checkpoints/best_lora", out="onnx_exported"):
	m = VisionEncoderDecoderModel.from_pretrained("alephpi/FormulaNet")
	if lora and Path(lora).exists():
		m = PeftModel.from_pretrained(m, lora).merge_and_unload()
	m.eval()
	p = Path(out)
	p.mkdir(parents=True, exist_ok=True)
	px = torch.randn(1, 1, 384, 384)
	ids = torch.tensor([[1, 2, 3]], dtype=torch.long)
	h = torch.randn(1, 576, 768)
	torch.onnx.export(
		m.encoder,
		px,
		str(p / "encoder_model.onnx"),
		input_names=["pixel_values"],
		output_names=["last_hidden_state"],
		opset_version=14,
	)
	torch.onnx.export(
		m.decoder,
		(ids, None, None, None, None, None, h),
		str(p / "decoder_model.onnx"),
		input_names=["input_ids", "encoder_hidden_states"],
		output_names=["logits"],
		opset_version=14,
	)


if __name__ == "__main__":
	a = sys.argv[1] if len(sys.argv) > 1 else "checkpoints/best_lora"
	b = sys.argv[2] if len(sys.argv) > 2 else "onnx_exported"
	export(a, b)
