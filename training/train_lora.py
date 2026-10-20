from pathlib import Path
from data_loader import HMEDataset
from peft import LoraConfig, get_peft_model
import torch
from torch.utils.data import DataLoader
from transformers import PreTrainedTokenizerFast, VisionEncoderDecoderModel

MODEL_NAME = "alephpi/FormulaNet"


def train(epochs=3, lr=1e-4, batch_size=4, out_dir="checkpoints/best_lora"):
	device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
	print(f"training on {device}")

	tokenizer = PreTrainedTokenizerFast.from_pretrained(MODEL_NAME)
	model = VisionEncoderDecoderModel.from_pretrained(MODEL_NAME)

	lora_config = LoraConfig(
		r=16,
		lora_alpha=32,
		target_modules=["q_proj", "v_proj"],
		lora_dropout=0.05,
		bias="none",
	)
	model = get_peft_model(model, lora_config)
	model.to(device)
	model.train()

	ds = HMEDataset(split="train", tokenizer=tokenizer)
	loader = DataLoader(ds, batch_size=batch_size, shuffle=True)
	optim = torch.optim.AdamW(model.parameters(), lr=lr)

	for epoch in range(epochs):
		total_loss = 0.0
		for step, batch in enumerate(loader):
			optim.zero_grad()
			px = batch["pixel_values"].to(device)
			lbl = batch["labels"].to(device)
			out = model(pixel_values=px, labels=lbl)
			loss = out.loss
			loss.backward()
			optim.step()
			total_loss += loss.item()
			if step % 20 == 0:
				print(f"epoch {epoch} step {step} loss: {loss.item():.4f}")

	out_path = Path(out_dir)
	out_path.mkdir(parents=True, exist_ok=True)
	model.save_pretrained(out_path)
	print(f"model saved to {out_path}")


if __name__ == "__main__":
	train()
