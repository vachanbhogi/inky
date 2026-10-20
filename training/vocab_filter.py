import torch
from transformers import LogitsProcessor

ALLOWED_MATH_TOKENS = (
	"0 1 2 3 4 5 6 7 8 9 + - = < > ( ) [ ] { } / * x y z a b c d n k m p q r s t u v w "
	"\\alpha \\beta \\gamma \\theta \\pi \\sigma \\lambda \\mu \\Delta \\int \\sum \\prod "
	"\\frac \\sqrt \\pm \\times \\div \\neq \\leq \\geq \\approx \\infty \\lim \\sin \\cos \\tan \\log \\ln"
).split()


class SchoolMathLogitsProcessor(LogitsProcessor):
	def __init__(self, tokenizer):
		self.allowed_ids = set()
		vocab = tokenizer.get_vocab()
		for tok_str in ALLOWED_MATH_TOKENS:
			if tok_str in vocab:
				self.allowed_ids.add(vocab[tok_str])
		for sp in [tokenizer.bos_token_id, tokenizer.eos_token_id, tokenizer.pad_token_id]:
			if sp is not None:
				self.allowed_ids.add(sp)
		self.allowed_list = sorted(list(self.allowed_ids))

	def __call__(
		self, input_ids: torch.LongTensor, scores: torch.FloatTensor
	) -> torch.FloatTensor:
		mask = torch.full_like(scores, -float("inf"))
		mask[:, self.allowed_list] = scores[:, self.allowed_list]
		return mask
