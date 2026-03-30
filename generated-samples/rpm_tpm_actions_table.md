# RPM/TPM Concurrency Table (Quick Planner)

## Observed baseline from your successful run

- Model: `gemini-flash-latest`
- attempted docs: `80`
- samples generated: `145`
- distill step duration (from Actions UI): `~54s`

Derived:

- base requests/min per action: `80 / (54/60) = 88.89`
- samples/min per action: `145 / (54/60) = 161.11`
- assumed retry overhead factor: `1.20`
- effective requests/min per action (planning): `88.89 * 1.20 = 106.67`

## Realistic baseline from your note (42 min for 80 docs)

If we trust your measured wall-clock runtime:

- docs/min per action: `80 / 42 = 1.90`
- samples/min per action: `145 / 42 = 3.45`
- avg docs time: `0.525 min/doc`

Projected single-action runtime (rough):

- 255 docs: `255 * 0.525 = 133.9 min` (about `2h 14m`)
- with retries/throttle spike: around `2.5h to 3h`

So yes, one run can climb near `3h` if API throttling increases.

Projected runtime for 7 shards (36-37 docs each):

- normal: around `19-20 min` per shard
- throttled: around `35-90 min` per shard

This is why 7 parallel can still be okay, but occasional long-tail runs are expected.

## Formula

- `max_by_rpm = floor(quota_rpm / effective_req_per_min)`
- `effective_tpm_per_action = effective_req_per_min * tokens_per_request`
- `max_by_tpm = floor(quota_tpm / effective_tpm_per_action)`
- `max_actions = min(max_by_rpm, max_by_tpm)`
- `safe_actions = max(1, floor(max_actions * 0.7))`

## Example table (you can replace quota values)

Assume `effective_req_per_min = 106.67`.

### Tokens/request = 1200

| quota RPM | quota TPM | max by RPM | max by TPM | max actions | safe actions (70%) |
|---:|---:|---:|---:|---:|---:|
| 120 | 200000 | 1 | 1 | 1 | 1 |
| 200 | 300000 | 1 | 2 | 1 | 1 |
| 400 | 1000000 | 3 | 7 | 3 | 2 |
| 1000 | 2000000 | 9 | 15 | 9 | 6 |
| 2000 | 4000000 | 18 | 31 | 18 | 12 |

### Tokens/request = 1600

| quota RPM | quota TPM | max by RPM | max by TPM | max actions | safe actions (70%) |
|---:|---:|---:|---:|---:|---:|
| 120 | 200000 | 1 | 1 | 1 | 1 |
| 200 | 300000 | 1 | 1 | 1 | 1 |
| 400 | 1000000 | 3 | 5 | 3 | 2 |
| 1000 | 2000000 | 9 | 11 | 9 | 6 |
| 2000 | 4000000 | 18 | 23 | 18 | 12 |

## Practical tip for tonight

- Start with `1-2` parallel Actions.
- If warning still appears, reduce concurrency or raise `sleep-sec` in workflow from `0.12` to `0.2-0.35`.
- Keep `max_samples_per_source=2` to avoid one file repeating too much.

## Prefilled plan for 7 parallel Actions (based on current stats)

Current corpus size from CI extract stats: `255` docs.

Keep these fields same in all 7 runs:

- model: `gemini-flash-latest`
- max_docs: `0`
- tasks_per_doc: `2`
- max_samples_per_source: `2`
- include_all_assets: `true`
- include_compiler: `true` (safe even if compiler files are absent in repo)

Fill per run like this:

| Run | start_index | end_index | docs in shard | artifact_name |
|---:|---:|---:|---:|---|
| 1 | 0 | 37 | 37 | generated-samples-1 |
| 2 | 37 | 74 | 37 | generated-samples-2 |
| 3 | 74 | 111 | 37 | generated-samples-3 |
| 4 | 111 | 147 | 36 | generated-samples-4 |
| 5 | 147 | 183 | 36 | generated-samples-5 |
| 6 | 183 | 219 | 36 | generated-samples-6 |
| 7 | 219 | 255 | 36 | generated-samples-7 |

Expected sample output per run (rough estimate from your baseline):

- shard 37 docs: around `65-72` samples
- shard 36 docs: around `63-70` samples

So total 7 runs may produce around `450-500` samples.

If you hit RPM/TPM warning at 7 runs, fallback to 6 runs:

- ranges: `0-43`, `43-86`, `86-129`, `129-171`, `171-213`, `213-255`

## Why 3-parallel can be faster than 7-parallel

Your intuition is correct when quota pressure is high:

- 7-parallel can trigger more 429/retries, causing long-tail delays.
- 3-parallel often has better per-run throughput and less retry overhead.

Simple check:

- if 3 runs each produce about 500 samples in 3h, total throughput is about 500 samples/hour,
- then 1000 samples arrives in about 2h.

Important cap note:

- with `max_samples_per_source=2`, one full pass over 255 docs has a hard cap around 510 samples.
- to pass 1000 in one wave, increase cap (for example 4) or run a second wave and dedupe.

Recommended 3-parallel setup for your current corpus (255 docs):

| Run | start_index | end_index | artifact_name |
|---:|---:|---:|---|
| 1 | 0 | 85 | generated-samples-a |
| 2 | 85 | 170 | generated-samples-b |
| 3 | 170 | 255 | generated-samples-c |

Suggested knobs in workflow UI:

- max_docs: `0`
- tasks_per_doc: `3`
- max_samples_per_source: `3` (or `4` if you target >1000 faster)
- temperature: `0.25`
- sleep_sec: `0.2`
- max_retries: `2`
- retry_sec: `1.0`
- json_fix_retries: `1`
