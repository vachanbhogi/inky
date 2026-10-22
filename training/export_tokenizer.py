"""Export the FormulaNet tokenizer vocabulary to a compact JSON bundle for the browser.

Writes public/models/formulanet-tokens.json containing:
  - id2token: token string for every id in [0, vocab_size)
  - bosId / eosId / padId: special token ids used by the decoder loop
  - maxLen: generation cap (decoder max_position_embeddings - 1, minus room for bos)

Run: uv run --with tokenizers training/export_tokenizer.py
"""

import json
import sys
from pathlib import Path

FORMULANET_TOKENIZER_ID = "alephpi/FormulaNet"
REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "public" / "models" / "formulanet-tokens.json"
MAX_LEN = 128  # equations never approach this; keeps the decode loop bounded


def main() -> None:
	from tokenizers import Tokenizer

	tok = Tokenizer.from_pretrained(FORMULANET_TOKENIZER_ID)
	vocab = tok.get_vocab(with_added_tokens=True)
	size = tok.get_vocab_size(with_added_tokens=True)
	id2token = [None] * size
	for token, idx in vocab.items():
		id2token[idx] = token
	if any(t is None for t in id2token):
		print("vocab has gaps", file=sys.stderr)
		sys.exit(1)

	payload = {
		"model": "alephpi/FormulaNet",
		"vocabSize": size,
		"bosId": tok.token_to_id("<s>"),
		"eosId": tok.token_to_id("</s>"),
		"padId": tok.token_to_id("<pad>"),
		"unkId": tok.token_to_id("<unk>"),
		"maxLen": MAX_LEN,
		"id2token": id2token,
	}
	OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
	OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
	print(f"wrote {OUT_PATH} ({OUT_PATH.stat().st_size} bytes, vocab={size})")


if __name__ == "__main__":
	main()
