# W2-T12: the GPU smoke, and taking the bundles in

This is the owner's step, and it is not part of the kit. It runs on rented RunPod pods: a 4090 pod for every stage, and an H100 pod for the stages that ask for one. What is built is `enginespace selftest --gpu` and `bun scripts/fixtures-intake.ts`. Nothing here has run on a real pod yet, so every command and every wall time below is [unverified] or [estimated] until you run it, and the first thing you learn is where they are wrong.

The course has not yet run any lab on a real engine, and each F-lane lab page says so. The bundles from this session are what change that, once they are in `tests/fixtures/receipts/` and the browser's rules pass them (W2-T12, acceptance 1 and 2).

The session never asks you to paste a token or a key into a file. Your RunPod account and your SSH key stay with RunPod and your own computer. The intake hashes a bundle and copies it, and a bundle holds nothing of yours; the intake refuses one that does.

Wall times are [estimated] and arbitrary: read each one as "plan for about this long", and write down what you measure.

## Step 0: check the pod, before anything else is paid for [estimated 5 minutes]

A pod is a container, and not a full virtual machine [unverified]. So the session leans on several things the container may not give you. Check each one on the pod, in this order, and stop at the first failure.

```bash
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv
nvidia-smi | head -n 4
df -h . | tail -n 1
python3 --version
nsys --version
nsys status --environment
```

| Check | What passes | If it fails |
|---|---|---|
| The GPU and the driver (`nvidia-smi`) | The GPU you asked for, and a driver of 580 or newer, which the CUDA 13 environments need (`labs/runners/runpod.md` says so) | A driver below 580: stop the pod and deploy another, from another datacentre if the console offers the choice. Do not install a driver: a container cannot |
| The CUDA runtime the pins need | The CUDA version in the top line of `nvidia-smi` is 13.0 or newer. The environments bring their own CUDA libraries as wheels, so the image's toolkit does not decide it: the driver does | The same as above |
| Free disk (`df`) | At least as many gigabytes as the lab's page lists, plus the environment's wheels, which are several gigabytes [estimated]. As a floor for a first session, 40 GB free [estimated, arbitrary] | Redeploy with a larger container disk. A full disk stops `uv sync` half way, and the pod's clock ran meanwhile |
| Python | 3.11 to 3.14 (3.11 and 3.12 for `nano-vllm`) | Wrong image: use the one in `labs/runners/runpod.md` |
| `nsys` inside the container | `nsys --version` prints a version, and `nsys status --environment` reports no failed check [unverified] | See below |

If `nsys` is missing or its environment check fails, the capture stages cannot run on that pod as it is. In order: try `nsys profile --sample=none --cpuctxsw=none ...`, which asks for less of the container than sampling does [unverified]; then a pod from RunPod's PyTorch template, which may carry `nsys` [unverified]; then give up `nsys` for the session and keep to the stages that capture with the torch profiler (`enginespace trace export --format torch` reads that one). Tell the course which it was, because a lab page must say which capture it expects. Do not pay for the H100 until the 4090 pod has passed this step.

## Step 1: the kit and the environment [estimated 10 to 20 minutes, mostly downloads]

Follow `labs/runners/runpod.md`, steps 1 to 4, with the kit's link and SHA-256 line from the lab's page. It ends with `enginespace doctor --env <environment>`. Do not go on past a failure of `doctor`.

Then:

```bash
enginespace version
```

Its source hash has to be the one the kit's README prints, and the one the course site lists. A receipt from any other grader build is not credited.

## Step 2: the selftest [estimated 2 to 5 minutes]

```bash
enginespace selftest --gpu
echo "exit status $?"
```

What a pass looks like: lines for the GPUs seen (name, memory, compute capability), the driver and the CUDA version it supports, torch built for CUDA and seeing the device, and a 64 by 64 fp32 product on the device that equals the CPU's in every entry, then the grader's own checks, then `selftest passed` and exit status 0. It says it ran no lab, because it did not.

What a failure looks like:

- One line on stderr starting `enginespace: selftest --gpu found no CUDA GPU on this machine`, and exit status 3: the container does not see the GPU. Go back to step 0.
- `FAIL  torch: ... a build without CUDA`: the environment installed a CPU torch. Re-run `uv sync --locked` in the environment for this lab, and do not mix environments.
- `FAIL  torch: ... does not see the GPU`: a driver older than the build's CUDA needs, or a container started without the GPU.
- `FAIL  product: ...`: the GPU's arithmetic differs from the CPU's on sums that are exact. Stop. Keep the output and tell the course: it is a fault, and either the pod or the grader's assumption is wrong.

Keep the whole output in a file in your own notes. It holds no host name or path, but read it before you share it.

## Step 3: one lab for each environment [estimated 30 to 90 minutes each, most of it the engine's start and the model's download]

W2-T12 wants one lab for each environment, on the 4090 and on the H100. Which lab is ready is on the course's labs page, and until the module that owns a lab has merged, there is no lab to run: say so and stop after step 2, because a smoke that ran no lab is a smoke of the machine, and the receipt fixtures wait for a lab.

For each lab that is ready, steps 5 and 6 of `labs/runners/runpod.md` give the commands (a challenge token from the Receipts page, `enginespace grade <lab>.<stage> --challenge <token> --host-kind runpod`, then `enginespace receipt verify`). Use `--assisted none --agent no` only if it is true.

Read the pod's own names now, before you stop it, because the intake cannot know them:

```bash
hostname
whoami
```

Write the two words down on your own computer, outside the repository. They go to the intake with `--forbid`, and nowhere else.

## Step 4: bring the bundle home, and stop the pod [estimated 5 minutes]

Steps 6 and 7 of `labs/runners/runpod.md`. Stop or terminate the pod when the last bundle is on your computer. Check that the file is there before you terminate: a terminated pod takes its disk.

## Step 5: take the bundle in, on your own computer [estimated 2 minutes for each bundle]

From the repository's root, on a branch of your own (never on `main`):

```bash
bun scripts/fixtures-intake.ts --dry <bundle> --forbid <the pod's host name> --forbid <the pod's user name>
bun scripts/fixtures-intake.ts <bundle> --forbid <the pod's host name> --forbid <the pod's user name>
bun test tests/verify/fixtures.test.ts
```

The intake reads the bundle, sweeps every string in it and every base64 artifact's bytes for a host name, a user name, an absolute path, a UUID and an IP or MAC address (your own computer's host name and user name are looked for as well), copies the file byte for byte into `tests/fixtures/receipts/` and appends its entry to `manifest.json`: the file, its SHA-256, the date, the stage and the GPU's name. It refuses, and writes nothing, when:

- the sweep finds something: the message says where (a pointer into the bundle) and what kind, and never prints the text. Do not edit the bundle to remove it: a fixture is never edited. Find out how it got there, fix the cause, and run the stage again;
- the bundle says it is synthetic, lists no GPU, is not a bundle, or is a file that is already a fixture;
- the name exists. A bundle that changed is another fixture: give it another name with `--name`.

Pass `--dated` only if the bundle's own date is not the day to record.

`tests/verify/fixtures.test.ts` then runs the browser's rules on each fixture, and the forgeries of `tests/verify/bestiary.ts` against it. A fixture whose stage the site has no declaration for fails the first, with the reason: the declaration lands with the lab. If a rule fails on an honest receipt, that is a finding about the verifier or the lab, and you keep the bundle and tell the course.

Commit the bundle and `manifest.json` together, and open a pull request as you do for any change. Do not add a licence line to a bundle: O-3 is open.

## Step 6: the pins (W1-T02), at any time after this merges

Separate from the GPU session. It needs no GPU: read D-035 and the engine pins in `course.lock.json`, and set D-035's status to accepted or changed, with the date. If the pods of step 0 could not meet driver 580, the pins' own fallback (v0.32.0, the last minor with CUDA 12.9 builds) is the choice to make, and the environments are re-locked with `bash labs/envs/relock.sh`.

## What to write down

For the course, per pod: the GPU name and driver from step 0, whether `nsys` worked and how, the wall time of each step against the [estimated] ones above, and the exit status and output of `enginespace selftest --gpu`. These replace the [estimated] and [unverified] marks of this page.
