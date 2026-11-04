# TR7 · Contribute honestly: reproduce a published number, and file it under each project's rules

**Status:** curriculum design for the owner's review, 2026-11-03. Nothing here is built. **Module id:** `tr7`. **Hours:** about 6 [estimated]: about 2 in the browser (B) and about 4 on a GPU (F). **Ships in:** W2 (D-002). **Owns:** nothing shared. It follows PLAN-100X §5.8's "OSS lower rungs" ("Reproduce a published number, then file an evidence-backed upstream issue") and keeps PLAN-100X §10's refusal of good-first-issue rungs.

**Sources and tags** as in [TR0](TR0-pytorch-for-rust.md). Research rows are cited as (vllm C1) and (sglang Z2). Every hour, threshold and tolerance is [estimated]. A table whose numbers share one tag says so in its caption.

**Two corrections to the catalog, carried here.**
- The catalog's TR7 line gives a "median PR cycle 1.04 d (vLLM)" with no source. It does not reproduce: across 1,005 vLLM pull requests merged from 2026-10-19 to 2026-11-01, the median from creation to merge was 2.12 days overall, 0.85 days for org members and collaborators, and 4.21 days for everyone else, with a p90 of 34.7 days for outsiders [measured by the research, vllm C5]. The 1.04 matches only one week's member-authored median (vllm U4). TR7 teaches the measured figures, labelled as merged-only and two weeks long, and re-measures them over at least four weeks before publishing (W2-T37).
- `PRODUCT.md` quotes vLLM's rule with single quotes. Upstream writes: Do not submit "pure agent" PRs (vllm C1). TR7 quotes it exactly.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Choose a published number you can actually check, reproduce it with evidence that stands on its own, and file it upstream under that project's rules, including its rules on AI assistance. This is the second half of outcome 4. |
| **What "land" means here** | The learner files the artifact: an evidence-backed issue by default, or a pull request. Upstream's response is outside the course and is never graded. The course grades the evidence and the draft (§5). |
| **Artifacts** | Items on each project's process rules (B); a reproduction with a receipt and an issue draft generated from it (F). |
| **Game slot** | None. A game would trivialise judgment about people and process (GAMES.md §12). |
| **Prerequisites** | T5.L1-T5.L10 (hard); T7.L2. TR8 first is strongly advised: the reproduction is measured by TR8's rules. |
| **GPU** | About 4 h, on a 4090-class GPU or, for an H100 target, about 2 h of the course's H100 budget [estimated]. |

## 1. What it teaches

1. **Each project has its own rulebook.** vLLM's contribution guide sets two rules for AI-assisted contributions (vllm C1), quoted exactly:

   > 1. Be involved: Do not submit "pure agent" PRs. The human submitter is responsible for reviewing all changed lines, validating behavior end-to-end, and running relevant tests.
   >
   > 2. Ensure significance: Avoid one-off "busywork" PRs

   Non-trivial AI help is reviewed, disclosed in the PR description and marked in commits with `Co-authored-by` (vllm C1). The repository's `AGENTS.md` applies to every AI-assisted contribution and warns: "Breaching these guidelines can result in automatic banning." (vllm C2). SGLang's guide and PR template at v0.5.23 carry no AI-disclosure, DCO or sign-off text; its template instead requires "Accuracy Tests" and "Speed Tests and Profiling" sections, CI needs a `run-ci` label, and LMSYS writes in favour of agent-assisted development with human review [unverified as policy] (sglang Z2). The learner learns to read the rulebook of the project they are filing in, not to carry one project's rules to another.
2. **The PR description, field by field** (vllm C2): why the work is not a duplicate, with the searches that show it (`gh issue view`, `gh pr list`); test commands and their results; model evaluation results when output, accuracy or serving changes; and an AI-assistance statement. vLLM's template has an "AI assistance was used" checkbox, and agents must run its `/pr-checklist` skill.
3. **DCO and RFCs** (vllm C3). Every commit needs a `Signed-off-by` line (`git commit -s`). A major architectural change, more than 500 lines excluding kernel, data, config and test files [measured from the guide], needs an RFC issue first, or the PR is tagged `rfc-required`; RFC titles start `[RFC]: ` and feedback usually takes at least a week. PR titles carry bracketed tags. Performance reports use the `[Performance]:` issue template with `collect_env.py`'s output.
4. **What to expect after filing.** vLLM's stated policy: reviewer status updates every 2-3 days, a ping after 7 days without review, at most 6 open PRs for contributors without write access (vllm C4). What actually happened over two weeks of merged PRs is §0's census, which has no unmerged PRs in it and so understates the wait [measured, vllm C5].
5. **Choosing a number worth reproducing.** A target must state its configuration, and must be reproducible on a 4090 or within the course's H100 hours. Upstream results from GB200 machines do not qualify: RFC #40846's 837.00 against 162.23 requests per second (Qwen3-0.6B at DP 4 on four GB200s, vLLM 0.19.0) and the MRV2 post's +56.2% (one GB200) [unverified, both vendor-reported; vllm X2, M5]. Candidates the owner reviews (W2-T37): the KV-offloading post's H100 numbers for Llama-3.1-8B (vllm K5), speculative acceptance rates (vllm TR7 notes), and SGLang v0.5.23 changes with stated deltas on small models (#43520, #44692, #45631, #46167, #43967; sglang TR7 notes) [all unverified until a learner-class GPU reproduces them].
6. **Evidence first, under TR8's rules.** Open loop where latency is claimed, warm-up excluded by rule, enough samples for the percentile, a bootstrap interval, the exact configuration and environment. A reproduction that misses the published number is still a contribution when its evidence is sound; the issue says what was compared and what did not match.
7. **Do no harm upstream.** One learner, one target; check for duplicates before filing; never file a draft you have not reproduced yourself. The course never points a cohort at one upstream item, and it never files anything for the learner.

**Knowledge components** (proposed; W2-T37 writes them):

| KC | Requires |
|---|---|
| `tr7.project-rulebooks` | — |
| `tr7.ai-disclosure` | `tr7.project-rulebooks` |
| `tr7.dco-rfc` | `tr7.project-rulebooks` |
| `tr7.duplicate-check` | `tr7.project-rulebooks` |
| `tr7.target-choice` | `ks:t7.benchmark-hygiene` |
| `tr7.issue-evidence` | `tr8.bootstrap-p99`, `tr7.target-choice` |
| `tr7.review-expectations` | `tr7.project-rulebooks` |

## 2. What it builds on

All ids were checked at kernelspace `origin/master` d478f91 on 2026-11-03.

| kernelspace | Id | What TR7 takes from it |
|---|---|---|
| Lesson | T7.L2 "Benchmarking Methodology: Measure Like You Mean It" (`t7.l2`), with "A benchmarking report you can write today" | The report's shape and benchmark hygiene (`t7.benchmark-hygiene`). |
| Lesson | T7.L1 "The Objective Function: Goodput, SLOs, and Honest Metrics" (`t7.l1`) | Honest metrics (`t7.goodput`, `t7.tail-percentiles`). |
| Lesson | T5.L10 "The Production Stack" (`t5.l10`) | Which project owns which component, so an issue goes to the right repository. |
| Plan | PLAN-100X §5.8 "OSS lower rungs" and §10 "We will not build: good-first-issue rungs" | The rung TR7 implements, and the rung it refuses: good first issues are scarce, and newcomer merges fell from 61.9% to 42.2% in one preprint (Hoshikawa 2026, as cited in PLAN-100X §10) [unverified here]. |

**Within enginespace.** TR8 (the measurement rules), TR3 (a profile as evidence; SGLang's template asks for one), TR1 (finding the code a number comes from).

## 3. Lessons

Minutes are [estimated].

| Id | Title | Minutes | Lane |
|---|---|---|---|
| `tr7.l1` | Two projects, two rulebooks: vLLM's and SGLang's | 30 | B |
| `tr7.l2` | DCO, RFCs, and a PR description field by field | 25 | B |
| `tr7.l3` | A number worth reproducing, on hardware you can rent | 20 | B |
| `tr7.l4` | Writing the issue: evidence first, AI disclosure always, and what happens next | 20 | B |
| — | Items and Prove-it | 25 | B |
| — | Lab `tr7.reproduce`, stages s1-s2 | 240 | F |

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | Before running the target: "Will your measurement's interval contain the published number?" committed in the browser when the challenge is issued. | `predict`, scored for calibration |
| **Play** | No game. Practice items on seeded PR descriptions, diff statistics and project choices. | `item` |
| **Build** | Reproduce a target and let the grader draft the issue from your receipt (§5). | `receipt` |
| **Prove** | With the agent closed: a seeded PR description with fields missing or wrong; name each problem and the rule that requires the fix, for the project the description targets. | `prove` (`proved`) |
| **Keep** | Today draws `tr7.pr-checklist`, `tr7.rfc-threshold`, `tr7.which-rulebook` and `tr7.what-to-expect`. | `review` |

## 5. Artifacts and how each is graded

| Artifact | Lane | What is graded | How | Pass |
|---|---|---|---|---|
| Item families `tr7.pr-checklist`, `tr7.rfc-threshold`, `tr7.which-rulebook`, `tr7.what-to-expect` | B | Answers on fresh seeds | Keys from the rules as claims (§8); `rfc-threshold` computes the line count excluding kernel, data, config and test files from a seeded diff summary | Exit ticket |
| `receipt:tr7.reproduce.s1` (the catalog's "reproduce a published number") | F | A run of the target's pinned configuration from `content/claims/tr7-targets.yaml` | Grader: pins, fingerprint, correctness by teacher-forced agreement where the target serves a model. Browser: recomputes the measured value and its seeded bootstrap interval from raw records under TR8's rules (ASSESSMENT §6), shows the configuration differences from the target, and checks floors | Every required check passes. Credit is for the evidence's consistency, never for matching the published number. |
| `receipt:tr7.reproduce.s2` (the issue draft) | F | `issue-draft.md`, generated by the grader from s1's receipt, plus the fields only the learner can fill | Browser: checks the draft's structured fields for the target project. For vLLM: a `[Performance]:` title, the environment block from `collect_env.py` with A§9.5's never-collected fields removed, the commands, the result with its interval, what was compared, the duplicate searches run, and the AI-assistance statement. For SGLang: the accuracy and speed-and-profiling sections. | Every required field present and consistent with the receipt. Prose is not graded. |
| Filing upstream | — | The learner's own act | Never graded. The learner may paste the issue's URL into the ledger as a note, at weight 0 | — |

The module counts as complete when the exit tickets, the items, s1 and s2 are credited, and a `proved` event exists (ASSESSMENT §9).

**Why the draft is generated.** Numbers in the draft come from the receipt, so a typed number cannot enter it; the learner writes the context, the comparison and the disclosure. The grader does not file, post or call any network service (A§9.1).

## 6. Game slot

None. TR7's evidence is a reproduction and a filed artifact (GAMES.md §12).

## 7. Pinned resources

| Resource | Pin | Notes |
|---|---|---|
| vLLM contribution guide | `docs/contributing/README.md` at v0.33.0 and `docs.vllm.ai/en/v0.33.0/contributing/` | vllm C1, C3, C4 |
| vLLM `AGENTS.md` and PR template | at v0.33.0 | vllm C2 |
| vLLM issue templates | `.github/ISSUE_TEMPLATE/750-RFC.yml` and `700-performance-discussion.yml` at v0.33.0 | vllm C3 |
| SGLang contribution guide and PR template | `docs/docs/developer_guide/contribution_guide.mdx` and `.github/pull_request_template.md` at v0.5.23 | sglang Z2 |
| Targets | `content/claims/tr7-targets.yaml`: 5-8 targets with source, configuration, hardware and the published value, reviewed by the owner (W2-T37) | each target pinned to an engine version |

## 8. Dated claims

| Claim | Tag | Source | Upstream date | TTL |
|---|---|---|---|---|
| vLLM's two AI-assisted contribution rules, quoted exactly; disclosure and `Co-authored-by` | [measured] | vllm C1 | 2026-11-01 | 14 days |
| vLLM's `AGENTS.md`: duplicate checks, PR description fields, the "automatic banning" warning; the template's checkbox and `/pr-checklist` | [measured] | vllm C2 | 2026-11-01 | 14 days |
| DCO, the RFC threshold and feedback period, bracketed titles, the `[Performance]:` template | [measured] | vllm C3 | 2026-11-01 | 14 days |
| Review policy: updates every 2-3 days, ping after 7, at most 6 open PRs | [measured] from the text; policy, not observed behaviour | vllm C4 | 2026-11-01 | 14 days |
| Merged-PR census, 2026-10-19 to 2026-11-01: medians 2.12 d (all), 0.85 d (members), 4.21 d (others); outsider p90 34.7 d; 59.0% of outsiders' merged PRs within 7 d | [measured] by the research; intervals [derived] by bootstrap | vllm C5 | 2026-11-01 | re-measure over ≥ 4 weeks before publishing, then 90 days |
| "Median PR cycle 1.04 d" has no source and reproduces only as one week's member median | [unverified] | vllm U4 | — | never published |
| SGLang's guide has no AI-disclosure or DCO text; its template asks for accuracy and speed-and-profiling evidence | [measured] by grep; [unverified] that nothing elsewhere says so | sglang Z2 | 2026-11-02 | 14 days |
| RFC #40846's request rates and MRV2's +56.2% are GB200 results | [unverified], vendor-reported | vllm X2, M5 | 2026-04-24; 2026-03-24 | static |

## 9. Hours

| Activity | B | F |
|---|---|---|
| Lessons `tr7.l1`-`tr7.l4` | 1.6 | — |
| Items and Prove-it | 0.4 | — |
| `tr7.reproduce` s1 (3.0), s2 (1.0) | — | 4.0 |
| **Total** | **about 2** | **about 4** |

All [estimated]. The catalog's figure is 6 h, kept.

## 10. What goes stale, and when

| Item | TTL | Detector |
|---|---|---|
| vLLM's policy text | 14 days | `grep -n "pure agent" docs/contributing/README.md` and `AGENTS.md` (vllm §6) |
| The census | 90 days after a ≥ 4-week re-measure | the research's GitHub-search method, re-run with a generic User-Agent |
| SGLang's template and guide | 14 days | the files above at each SGLang minor |
| Each target's reproducibility | 14 days (a new minor can change it) | the owner's GPU smoke at each re-pin (W2-T12) |

## 11. Open items

1. **The target list** is the owner's to review (W2-T37), and no target ships until the owner has reproduced it once on the course's reference hardware.
2. **Stale upstream docs this research found.** vLLM's CUDA-graph design page shows a 4-field descriptor that no code has (vllm G5), and its hybrid KV page says "exactly two" groups where the code handles N (vllm K1). These are real, checkable discrepancies. Whether they are worth a docs PR, and who files them, is the owner's call; the course will not route learners to them, because one fix filed by many people is busywork upstream.
3. **SGLang's position on AI-assisted PRs** is unwritten in its repository (sglang Z2). TR7 teaches what is written and says what is not.
