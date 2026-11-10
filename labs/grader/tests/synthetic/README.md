# Synthetic fixtures

Everything in this folder is **synthetic**: written by hand for the tests of the fingerprint (W2-T03), with invented values. No machine produced these files, and no engine ran. The repository is public, so no real host's name, user, GPU UUID, serial number or path is in them. They are not the owner's recordings: W2-T12 (the owner's GPU smoke run) adds those, under `tests/fixtures/receipts/`.

A GPU's name is a product name (`NVIDIA GeForce RTX 4090`, the name the hardware atlas keys on), and a memory size or a clock beside it is plausible and invented.

## `nvidia-smi/`

What `nvidia-smi` would print, in the formats its documentation describes (`--query-gpu=<columns> --format=csv,noheader,nounits`, `--version`, and the table it prints with no arguments). The columns of the query are `fingerprint.SMI_COLUMNS`, in that order.

| File | What it stands for |
|---|---|
| `rtx4090.csv` | one GeForce card on a R580 driver, with MIG and ECC not available (`[N/A]`) |
| `h100-sxm.csv` | one H100 80GB HBM3, MIG disabled, ECC enabled |
| `a100-r570-mig.csv` | one A100 on a R570 driver (older than the R580 that vLLM 0.33.0's CUDA 13 wheels need) with MIG enabled |
| `two-l4.csv` | two L4 cards |
| `old-driver-minimal.csv` | the answer to the small query (`name`, `memory.total`, `driver_version`) that an older driver gives when it refuses a column |
| `with-units.csv` | a row with its units left in, and `[Not Supported]` for ECC |
| `version-r580.txt` | `nvidia-smi --version` of a R580 driver |
| `banner-r570.txt` | the table of `nvidia-smi` with no arguments, with the CUDA version in its first line and a bus address (`00000000:00:04.0`) that no receipt may hold |

## `vllm/`

Logs and configuration dumps in the shape of vLLM v0.33.0 (commit 4ba787e), the course's pin. Every log line was written from the format string of the statement that prints it (`content/claims/vllm/logs.yaml` quotes each statement with its file and line). Each log is a `.txt` file (the repository's `.gitignore` leaves out `*.log`), and starts with a `# SYNTHETIC` line, which a test requires.

| File | What it stands for |
|---|---|
| `mrv2-default.txt` | a server on a 24 GB card with every default, at INFO: the runner, the graph mode, the backend and the token budget are in the log, and async scheduling and `max_num_seqs` are not |
| `mrv1-custom-proposer.txt` | a custom proposer (TR6), which MRV2 does not support: the fallback warning and async scheduling switched off, at DEBUG, so that this log alone gives all six fields |
| `downgrade.txt` | the user asked for `FULL` with speculation and FlashInfer: two downgrades in a row, the second to `PIECEWISE` |
| `enforce-eager.txt` | `enforce_eager`: the warning, and a config line that says `NONE` |
| `server-info-rtx4090.json`, `server-info-h100.json` | the answer of `/server_info?config_format=json` (a dev-mode endpoint), for the same command on a 24 GB card and on an 80 GB card: the token budget and `max_num_seqs` differ by GPU (the research's row M9) |

A re-pin re-reads the claims, and the logs here follow what the claims say.
