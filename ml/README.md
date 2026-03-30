# ML Pipeline for Calculator Game Coding Model

This folder contains an end-to-end pipeline to build a specialized coding model for hard calculator-game programming tasks.

## What You Get

1. Corpus extraction from local files (PDF, DOCX, TXT, ASM)
2. Teacher distillation with Gemini
3. SFT dataset builder (train/val/test)
4. QLoRA training entrypoint for Qwen models
5. Smoke evaluation script
6. GitHub Actions validation workflow

## Recommended Model Strategy

1. Main training model: Qwen2.5-Coder-7B-Instruct (QLoRA)
2. Baseline or edge model: Qwen3-0.6B
3. Teacher model: Gemini Pro family for synthetic task generation

## 0) Setup Python Environment

From repo root:

```bash
pip install -r ml/requirements.txt
```

## Chay 1 lenh duy nhat

Dat key truoc:

```bash
set GEMINI_API_KEY=your_key_here
```

Sau do chay pipeline full (extract -> distill -> build dataset):

```bash
python ml/scripts/run_pipeline.py --model gemini-flash-latest --shards 2 --tasks-per-doc 2
```

Lenh nay tu chia shard song song noi bo, nen ban chi can 1 terminal.

Neu muon dung full PDF trong assets (khong loc theo keyword), them `--include-all-assets`:

```bash
python ml/scripts/run_pipeline.py --model gemini-flash-latest --include-all-assets --shards 2 --tasks-per-doc 2
```

## 1) Extract Game Corpus

```bash
python ml/scripts/extract_game_corpus.py \
  --assets-dir guidesnpdf/assets \
  --output-dir ml/data/raw
```

Output files:

- ml/data/raw/game_corpus.jsonl
- ml/data/raw/game_corpus_stats.json

## 2) Distill with Gemini

Set API key first:

```bash
set GEMINI_API_KEY=your_key_here
```

Run distillation:

```bash
python ml/scripts/distill_with_gemini.py \
  --input ml/data/raw/game_corpus.jsonl \
  --output ml/data/distill/sft_candidates.jsonl \
  --model gemini-flash-latest \
  --max-docs 80 \
  --tasks-per-doc 4
```

Output files:

- ml/data/distill/sft_candidates.jsonl
- ml/data/distill/sft_candidates.stats.json

## 3) Build Final SFT Dataset

```bash
python ml/scripts/build_sft_dataset.py \
  --input ml/data/distill/sft_candidates.jsonl \
  --output-dir ml/data/processed
```

Output files:

- ml/data/processed/train.jsonl
- ml/data/processed/val.jsonl
- ml/data/processed/test.jsonl
- ml/data/processed/dataset_stats.json

## 4) Train QLoRA

### Option A: stronger model (recommended)

```bash
python ml/train/train_qlora.py \
  --model-name Qwen/Qwen2.5-Coder-7B-Instruct \
  --train-file ml/data/processed/train.jsonl \
  --eval-file ml/data/processed/val.jsonl \
  --output-dir ml/output/qwen-game-7b \
  --epochs 2 \
  --max-seq-len 2048
```

### Option B: lighter model

```bash
python ml/train/train_qlora.py \
  --model-name Qwen/Qwen3-0.6B \
  --train-file ml/data/processed/train.jsonl \
  --eval-file ml/data/processed/val.jsonl \
  --output-dir ml/output/qwen-game-0p6b \
  --epochs 3 \
  --max-seq-len 1536
```

## 5) Smoke Evaluation

```bash
python ml/scripts/smoke_eval.py \
  --model-name Qwen/Qwen2.5-Coder-7B-Instruct \
  --adapter-dir ml/output/qwen-game-7b/adapter \
  --eval-file ml/data/processed/test.jsonl \
  --output ml/data/processed/smoke_eval_outputs.jsonl
```

## 6) Colab Workflow (Personal Account)

Use a notebook with GPU runtime and run:

```python
!pip install -q -r /content/bigcio/ml/requirements.txt
!python /content/bigcio/ml/scripts/extract_game_corpus.py --assets-dir /content/bigcio/guidesnpdf/assets --output-dir /content/bigcio/ml/data/raw
!python /content/bigcio/ml/scripts/distill_with_gemini.py --input /content/bigcio/ml/data/raw/game_corpus.jsonl --output /content/bigcio/ml/data/distill/sft_candidates.jsonl --max-docs 80 --tasks-per-doc 4
!python /content/bigcio/ml/scripts/build_sft_dataset.py --input /content/bigcio/ml/data/distill/sft_candidates.jsonl --output-dir /content/bigcio/ml/data/processed
!python /content/bigcio/ml/train/train_qlora.py --model-name Qwen/Qwen2.5-Coder-7B-Instruct --train-file /content/bigcio/ml/data/processed/train.jsonl --eval-file /content/bigcio/ml/data/processed/val.jsonl --output-dir /content/bigcio/ml/output/qwen-game-7b
```

## Suggested Training Targets

1. At least 1,200 high-quality SFT samples
2. Validation loss trending down through epoch 2
3. Smoke eval with no empty outputs and no repetition loops

## Notes

1. GitHub Actions runners are CPU-first; use Actions for validation, not full training.
2. Keep generated datasets and model outputs out of git.
3. If teacher output quality drops, lower temperature to 0.3 to increase consistency.

## GitHub CI: Chi lay samples

Da co workflow `Generate Samples Only` tai:

- `.github/workflows/samples-only.yml`

Cach dung nhanh:

1. Vao GitHub repo -> `Settings` -> `Secrets and variables` -> `Actions`
2. Tao secret `GEMINI_API_KEY`
3. Vao tab `Actions` -> chon `Generate Samples Only`
4. Bam `Run workflow`, chon model/mac dinh va so docs
5. Tai artifact `generated-samples` sau khi job xong

Chay nhieu action song song (khong trung mau):

1. Run A: `start_index=0`, `end_index=100`, `artifact_name=generated-samples-a`
2. Run B: `start_index=100`, `end_index=200`, `artifact_name=generated-samples-b`
3. Run C: `start_index=200`, `end_index=0`, `artifact_name=generated-samples-c`

Luu y:

- Dat `max_docs=0` khi dung start/end range de lay het docs trong range.
- Giu `max_samples_per_source=2` de tranh 1 file lap qua nhieu mau.
