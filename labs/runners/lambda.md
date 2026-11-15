# Run a stage on Lambda

A copy-and-paste session for grading one lab stage on a GPU instance that you rent from Lambda (its On-Demand Cloud). It is the same grader, the same locked environment and the same receipt as on your own machine (ARCHITECTURE section 9.3); only the machine is rented. You pay Lambda, with your own account. enginespace holds no account, receives no key of yours and prices nothing here: read the price on the console before you launch.

**Status.** Nobody has run this session on a rented GPU yet: the owner's smoke run does it (W2-T12), and until then every step below is [unverified]. What it assumes of the instance is read from Lambda's documentation as it stood on 2026-11-15 [measured] (claims `runners.lambda.default-image` and `runners.lambda.no-consumer-gpu`): the default image is Ubuntu 22.04 with Lambda Stack, which includes the NVIDIA container toolkit and Docker.

Read the receipt before you upload it. A bundle holds no host name, user name, address or key (ARCHITECTURE section 9.9), and the grader refuses to write one that does, but you are the one who moves the file.

## Why this one uses Docker

Ubuntu 22.04's own Python is 3.10 [unverified], below the grader's range of 3.11 to 3.14 (ARCHITECTURE section 9.3). So here the environment's own Dockerfile is built on the instance, as the Dockerfile's first comment says, and every command runs in the container. That is the `modal_app.py` route too, on a machine that you can log in to.

## What you need

- A Lambda account, with a payment method and your SSH public key added in its console.
- The kit: the link and the SHA-256 line that the lab's page gives you (W2-T10 builds the kit and its page).
- A challenge token for the stage, from the Receipts page, copied whole.
- Which environment the lab uses (`vllm`, `sglang` or `nano-vllm`; `cpu` needs no GPU, so grade it on your own machine). Its Dockerfile starts from an official image at a pinned tag, which was checked on 2026-11-15 [measured]: `vllm/vllm-openai:v0.33.0` (claim `vllm.image.openai-tag`), `lmsysorg/sglang:v0.5.23` (claim `sglang.image.tag`) and `nvidia/cuda:13.0.2-cudnn-devel-ubuntu24.04` (claim `runners.image.cuda-devel`).

Lambda's documentation lists no RTX 4090: its instance types are datacentre GPUs, an H100 among them (claim `runners.lambda.no-consumer-gpu`). For a 4090 receipt use RunPod ([runpod.md](runpod.md)) or your own machine.

The three GPU environments are CUDA 13 builds, which need a host driver of R580 or newer (claim `vllm.release.driver-r580`). Step 2 checks the instance's driver, and a driver older than that means launching another instance, since the container cannot bring a newer one.

## 1. Launch an instance

In the Lambda console, launch an instance of a GPU type that the lab asks for, with the default image, and attach your SSH key. When it is running, copy its address from the console and connect from your own computer. The command is the console's own; it usually has this shape, with your address in it [unverified]:

```bash
INSTANCE_IP='203.0.113.7'   # EDIT: the instance's address, from the console
ssh "ubuntu@$INSTANCE_IP"
```

## 2. Check the instance

On the instance. The driver must be 580 or newer for the CUDA 13 environments, and the second command must print a Docker version.

```bash
nvidia-smi --query-gpu=name,driver_version --format=csv
docker --version
df -h . | tail -n 1
```

## 3. Get the kit and build the image

On the instance. Edit the three lines marked `# EDIT`, then paste the whole block. The build installs uv 0.10.2 exactly and the locked environment, with the hash of every file, into the image. It downloads gigabytes of wheels [estimated] and takes a while.

```bash
KIT_URL='https://enginespace.naigap.com/labs/enginespace-gpu-kit.zip'   # EDIT: the link on the lab's page
KIT_SHA256='0000000000000000000000000000000000000000000000000000000000000000'   # EDIT: the SHA-256 line on the lab's page
ENV_NAME='vllm'   # EDIT: vllm, sglang or nano-vllm

mkdir -p "$HOME/es" && cd "$HOME/es" && \
  curl -fL --proto '=https' -o kit.zip "$KIT_URL" && \
  echo "$KIT_SHA256  kit.zip" | sha256sum -c - && \
  python3 -m zipfile -e kit.zip . && \
  cd enginespace-gpu-kit && \
  docker build -f "envs/$ENV_NAME/Dockerfile" -t "enginespace-$ENV_NAME" .
```

The `&&` chain stops at `sha256sum -c`, on purpose, if the download is not the kit the site published. If `docker` answers "permission denied", put `sudo` in front of it: Lambda's documentation does not say that the default user is in the `docker` group [unverified].

## 4. Check the environment

On the instance, in the kit's folder. A container that is started from the image has the kit's folder mounted as `/work`, so the lock file and the references manifest are found. The cache of downloads is kept in the kit's folder too, so a second run does not fetch a model again.

```bash
run_in_image() {
  docker run --rm --gpus all \
    -v "$PWD:/work" -w /work \
    -e ENGINESPACE_KIT=/work -e ENGINESPACE_CACHE=/work/.cache \
    "enginespace-$ENV_NAME" "$@"
}

run_in_image enginespace doctor --env "$ENV_NAME"
```

`doctor` prints what a receipt will record about this machine and compares the engine, torch and the key libraries with `course.lock.json`. It exits 1 on an off-pin package or an old driver. Do not go on past a failure: a receipt made on the wrong pin does not verify.

## 5. Grade

On the instance, in the same shell (so `run_in_image` and `ENV_NAME` are still defined):

```bash
STAGE='tr8.replay.s1'   # EDIT: the stage you were issued a challenge for
TOKEN='es1:tr8.replay.s1:0badc0de:ABCDEFGHJKLMNPQR:20261104:00000000'   # EDIT: the whole token from the Receipts page
ASSISTED='none'   # EDIT: none, explain or code: how much help you had
AGENT='no'   # EDIT: yes or no: whether an agent worked on the lab

LAB="${STAGE%.*}"
run_in_image enginespace fetch "$LAB"
run_in_image enginespace grade "$STAGE" --challenge "$TOKEN" --host-kind lambda --assisted "$ASSISTED" --agent "$AGENT"
sudo chown -R "$(id -u):$(id -g)" receipts
ls -l receipts
run_in_image enginespace receipt verify receipts/*.es.json.gz
```

- Leave out `enginespace fetch` for a lab whose page lists no download. It stops with a message for a lab that lists none.
- `--assisted` and `--agent` are your own declaration. Leave them out and the receipt records the most help, which costs you nothing but a weight (ASSESSMENT section 3.2). Say what is true.
- `grade` exits 1 when a check of the lab failed, and writes the bundle all the same: the site shows the failed check and its reason.
- A token is good for 14 days [estimated, ARCHITECTURE section 8.4]. The grader warns about an old one and the site refuses an expired one.
- The container runs as root, so it writes the bundle as root; the `chown` gives the file back to you.

## 6. Bring the bundle home

On your own computer, with the address from step 1:

```bash
INSTANCE_IP='203.0.113.7'   # EDIT: the instance's address, from the console

mkdir -p receipts
scp "ubuntu@$INSTANCE_IP:es/enginespace-gpu-kit/receipts/*.es.json.gz" receipts/
ls -l receipts
```

Then open the Receipts page and add the file from there. The check runs in your browser (ARCHITECTURE section 8.5), and nothing is uploaded.

## 7. Terminate the instance

Terminate the instance in the console when you are done: it bills while it exists, and Lambda's page on billing says when it stops [unverified]. Your bundle is on your computer; the instance's disk goes with it.

## Trouble

- **`docker build` fails on a base image pull.** The tag may have moved or the registry may be slow; the claims named above were checked on 2026-11-15 [measured] and a re-check is `docker manifest inspect <image>:<tag>`.
- **`could not select device driver "" with capabilities: [[gpu]]`.** The NVIDIA container toolkit is missing from the image you launched. The default image has it (claim `runners.lambda.default-image`); a GPU Base image may not.
- **`doctor` reports an old driver.** Launch another instance. A container uses the host's driver.
