# content/claims/

The dated, sourced facts that content cites as `{{claim:id}}` (ARCHITECTURE §4.4, D-012). `content/README.md` says what a claim is and what its fields mean. This note says what the folder holds, how the upstream claims were read, and what changed since kernelspace's lab twins.

## What is here

| Path | What |
|---|---|
| `vllm/` | vLLM at the pin, v0.33.0, in seven files: `release.yaml`, `engine.yaml` (the runner, the step loop, the scheduler, the defaults), `graphs.yaml`, `kv.yaml` (hybrid groups, adapter slots, the KV events), `spec.yaml` (speculation and the mask), `bench.yaml` (`vllm bench serve`) and `steploop.yaml` (W1-T12: how the two runners dispatch CUDA graphs, how the capture sizes and the graph memory are chosen, and the scheduler's rules for drafts, adapters and the mask) |
| `sglang/` | SGLang at the pin, v0.5.23, in `engine.yaml`, `graphs.yaml`, `kv.yaml`, `spec.yaml` and `bench.yaml` |
| `readings.yaml` | The reading targets of TR1: "Inside vLLM" at commit 42172ad, nano-vllm and Mini-SGLang |
| `loop.yaml` | Service (`loop`)'s synthetic world and its real anchor (W0-T16) |
| `sample.yaml` | The sample lesson's claims (W0-T08) |
| `worlds/` | What the notional-machine cards cite beyond the files above (W1-T07): `engines.yaml`, ten more facts about vLLM and SGLang at the pins (vLLM's engine-core process, its abort status, its stop check, the bonus token of speculation and its sampling constraints, the profiler's trace files and the Nsight Systems option for graphs; SGLang's three components, their IPC and its goodput duration), and `references.yaml`, the speculative-decoding paper, the S-LoRA paper, Little's law and the Perfetto trace format. An id here starts with its world (`spec`, `kv`, `bench`, `trace`) when its source is not an engine's |

An id reads `<area>.<topic>.<attribute>`, and the area is the engine or the reading target: `vllm`, `sglang`, `inside-vllm`, `nano-vllm` or `mini-sglang`. The `pin` of a claim is that engine's key in `course.lock.json`, so a moved pin raises a change card for every claim that names it (ARCHITECTURE §4.4). `npm run verify:pins` checks the lockfile, and `npm run verify:claims` checks that each `pin` names one of its keys.

## How the upstream claims were read

W1-T01 re-read every claim at its source on 2026-11-04. Where `research/upstream-vllm.md` and `research/upstream-sglang.md` (read on 2026-11-03) had the row, the claim starts from it, and the source was fetched again to quote it.

- **Where from.** A claim cites a file at the pinned tag or commit, with a `#L` anchor for the lines that hold its quote, or a release page, a pull request, a PyPI JSON page or the Inside vLLM post. It never cites `main`, `latest` or `stable`, because those move. A fact about an older release, such as the day a default changed, cites that release, and its TTL is 365 days. A fact that belongs to the pin has a TTL of 90 days, the quarter that the pin lasts.
- **How a quote was checked.** The tag's source tarball (checked against the tag's commit with `git get-tar-commit-id`) and each page were downloaded into their own folders and read as text, and never executed. Every quote was then found verbatim inside the lines its anchor names. A source that splits a string across lines is quoted from one of its lines.
- **How it was fetched.** Every request sent the User-Agent `Mozilla/5.0 (X11; Linux x86_64)`, with no cookie, no login and no other header that names anyone: `curl` sent `Host`, `User-Agent` and `Accept`, and `git ls-remote`, run with its configuration and credential helpers emptied, sent `Accept-Encoding`, `Pragma` and `Git-Protocol` as well. Pages and tarballs came from `github.com`, `codeload.github.com`, `raw.githubusercontent.com`, `pypi.org`, `vllm.ai`, `ui.perfetto.dev`, `developer.nvidia.com` and `docs.nvidia.com`, and the tags came from `git ls-remote`. No call used the GitHub API or the `gh` CLI.
- **A value is a number or a string.** A switch is written as the string `'true'` or `'false'`, and a list as one string.
- **An absence has no quote.** A claim that something is not there, such as an adapter in the KV block code, quotes the nearest line that shows the structure and says in its text where it looked.

## What changed since kernelspace's twins

Kernelspace's two lab twins read vLLM v0.31.0 (claim `twin.vllm.scheduler`, lab 06) and SGLang v0.5.21 (claim `twin.sglang.treecore`, lab 07). enginespace pins vLLM v0.33.0, two minors later, and SGLang v0.5.23, also two minors later. Everything below was measured on 2026-11-04.

### vLLM, v0.31.0 to v0.33.0

- **The lab 06 twin still holds.** Each statement it reads from `vllm/config/scheduler.py`, `vllm/v1/core/sched/scheduler.py` and `vllm/v1/core/kv_cache_manager.py` is true at v0.33.0: `scheduler_reserve_full_isl` is on (`vllm.scheduler.reserve-full-isl`), chunked prefill is on (`vllm.scheduler.chunked-prefill-default`), `long_prefill_token_threshold` is 0 (`vllm.scheduler.long-prefill-threshold-default`), the policy is fcfs (`vllm.scheduler.policy-default`), the watermark is 0.0, `allocate_slots` takes `full_sequence_must_fit`, and under fcfs the victim is `self.running[-1]` (`vllm.scheduler.preemption-victim`). Only the line numbers moved: the victim line went from 771 to 938 [measured].
- **The files grew.** `scheduler.py` went from 3,359 lines to 3,783, with 608 lines added and 184 removed. `config/scheduler.py` changed by 8 lines added and 6 removed, `kv_cache_manager.py` by 24 added and 55 removed, and `request_queue.py` is identical [measured].
- **MRV2 can run more of what the twin's world had.** MRV2 fell back to MRV1 for 8 reasons at v0.31.0 and does for 5 at v0.33.0 (`vllm.mrv2.fallback-reasons`). The n-gram methods, `medusa` and `mlp_speculator`, stock `torch.compile`, sequence parallelism, elastic expert parallelism and Mamba cache mode `all` left the list, and heterogeneous-vocabulary draft models joined it [measured]. Of the speculative methods only `suffix` and `custom_class` still force MRV1 (`vllm.spec.custom-class-mrv1`).
- **Speculation lost two methods.** Medusa and the MLP speculator were removed in v0.33.0 (`vllm.spec.medusa-removed`).
- **The wheels changed.** From v0.33.0 the wheels and images are CUDA 13.0 only, which needs a host driver of R580 or newer. Earlier releases also published CUDA 12.9 wheels and images, and v0.32.0 was the last (`vllm.release.cuda-13-only`, `vllm.release.driver-r580`).
- **Structured output** has one deprecation: the LM Format Enforcer backend is opt-in in v0.34.0 and removed in v0.35.0 (`vllm.mask.lmfe-deprecated`).

### SGLang, v0.5.21 to v0.5.23

- **The lab 07 twin may not hold, and nobody has re-read it.** Four of the five Rust files that the twin names changed between the two releases: `unified_tree_core.rs` went from 5,666 lines to 6,203 (906 added, 369 removed), `node.rs` changed by 59 lines added and 14 removed, `components/full.rs` by 68 and 29, and `components/mod.rs` by 60 and 8. `unified_lru_list.rs` is identical [measured]. Every function that the twin names is still there (`match_prefix`, `match_prefix_helper_`, `split_node_`, `insert`, `insert_walk_step_`, `insert_commit_step_`, `evict_device_next_node` and `is_evictable_device_leaf_`), and the four crate tests that its answers cite are still in `src/tests/unified_tree_core.rs` [measured]. Whether each of the twin's three answers still holds at v0.5.23 was not worked out again [unverified]. A task that quotes lab 07's twin as SGLang's behaviour should do that first.
- **Removals.** v0.5.22 removed the `tc_piecewise` prefill graph backend (`sglang.cudagraph.tc-piecewise-removed`) and the `ChunkCache` class. v0.5.21 had already removed the legacy radix classes and `SGLANG_ENABLE_SPEC_V2` (`sglang.radix.legacy-classes-removed`, `sglang.spec.v2-only`), so the twin's release already sits on `UnifiedRadixCache`.
- **Additions.** v0.5.23 added `--goodput` to `bench_serving` (`sglang.bench.goodput-since`) and published opaque LoRA block ids and adapter names in its KV events (pull request 42817; `sglang.kv-events.lora-ids-since`, `sglang.kv-events.adapter-field`).
- **The pins differ in their libraries.** SGLang 0.5.23 pins `torch==2.14.1` and `xgrammar==0.2.7`, where vLLM 0.33.0 pins `torch==2.14.0` and `xgrammar==0.2.8` (`sglang.release.torch-pin`, `vllm.release.torch-pin`), so each engine gets its own environment (ARCHITECTURE §9.2). Mini-SGLang pins `torch<2.10.0` and needs a third (`mini-sglang.torch-pin`).

## At the next re-pin

Read each claim again at the new tag. A claim whose quote moved or changed raises a change card, and the research files' drift detectors (`research/upstream-vllm.md` §6) list the greps to start from. Change the `pin` entry in `course.lock.json` last, and bump `checkedAt` on the entries that were re-read.
