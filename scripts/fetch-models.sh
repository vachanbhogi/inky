#!/usr/bin/env bash
# Ensure the FormulaNet runtime models exist in public/models/ (gitignored).
# Without them the capsule still works — ML silently degrades to the rule
# recognizer — but the full flow needs: formulanet-tokens.json, encoder.ort,
# decoder.ort (alephpi/FormulaNet ONNX export, or training/export_onnx.py +
# training/export_tokenizer.py in this repo).
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODELS_DIR="$ROOT/public/models"
missing=""
for f in formulanet-tokens.json encoder.ort decoder.ort; do
  [ -f "$MODELS_DIR/$f" ] || missing="$missing $f"
done
if [ -z "$missing" ]; then
  echo "ok: all runtime models present in public/models/"
  exit 0
fi
echo "missing from public/models/:$missing"
echo "Either copy the exported .ort/.json files from the FormulaNet upstream"
echo "export, or re-export via training/export_onnx.py + training/export_tokenizer.py."
exit 1
