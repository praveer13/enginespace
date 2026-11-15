# Run a stage on RunPod

A copy-and-paste session for grading one lab stage on a GPU that you rent from RunPod. It is the same grader, the same locked environment and the same receipt as on your own machine (ARCHITECTURE section 9.3); only the machine is rented. You pay RunPod, with your own account. enginespace holds no account, receives no key of yours and prices nothing here: read the price on the console before you deploy.

**Status.** Nobody has run this session on a rented GPU yet: the owner's smoke run does it (W2-T12), and until then every step below is [unverified]. The fields of the RunPod console are read from RunPod's documentation as it stood on 2026-11-15 [measured] (claims `runners.runpod.no-docker-in-pod` and `runners.runpod.custom-template-ssh`), and a console can be renamed under you. When a name differs, keep the idea: a pod that runs the image below, with SSH open and a public address.

Read the receipt before you upload it. A bundle holds no host name, user name, address or key (ARCHITECTURE section 9.9), and the grader refuses to write one that does, but you are the one who moves the file.

## What you need

- A RunPod account, with a payment method and your SSH public key added in its settings.
- The kit: the link and the SHA-256 line that the lab's page gives you (W2-T10 builds the kit and its page).
- A challenge token for the stage, from the Receipts page, copied whole.
- Which environment the lab uses. The lab's page says so; the base image of each one is below.

| Environment | Image for the pod (the base of that environment's Dockerfile) | Checked [measured 2026-11-15] |
|---|---|---|
| `vllm` | `vllm/vllm-openai:v0.33.0` | claim `vllm.image.openai-tag` |
| `sglang` | `lmsysorg/sglang:v0.5.23` | claim `sglang.image.tag` |
| `nano-vllm` | `nvidia/cuda:13.0.2-cudnn-devel-ubuntu24.04` | claim `runners.image.cuda-devel` |
| `cpu` | needs no GPU: grade it on your own machine | claim `runners.image.python-slim` |

The three GPU environments are CUDA 13 builds, which need a host driver of R580 or newer (claim `vllm.release.driver-r580`). Step 3 checks the pod's driver before anything is installed, and a pod with an older one is stopped and replaced.

## 1. Deploy a pod

In the RunPod console, deploy a pod on the GPU the lab asks for (an RTX 4090 and an H100 are the two that the course's receipts are fixtured on, W2-T12), and make a template for it:

- **Container image:** the image of your environment from the table.
- **Container start command**, which keeps the pod running and starts an SSH server. The command is RunPod's own recipe for a custom template, from its page on SSH (claim `runners.runpod.custom-template-ssh`). It overrides the image's `vllm serve` or `sglang` start; if the pod's logs show an engine starting, the image's own entrypoint is still in front of your command (see Trouble, below).

```
bash -c 'apt update; DEBIAN_FRONTEND=noninteractive apt-get install openssh-server -y; mkdir -p ~/.ssh; cd ~/.ssh; chmod 700 ~/.ssh; echo "$PUBLIC_KEY" >> authorized_keys; chmod 600 authorized_keys; service ssh start; sleep infinity'
```

- **Expose TCP port 22**, and ask for a pod with a **public IP address**: `scp` does not work through RunPod's proxied SSH.
- **Environment variable** `PUBLIC_KEY`, set to the contents of your public key file (`~/.ssh/id_ed25519.pub`, for one made with `ssh-keygen -t ed25519`).
- A **container disk** for the images' packages and the model: the lab's page says how many gigabytes it downloads, and the whole disk must hold that and the environment's wheels, which are several gigabytes [estimated].

RunPod runs Docker for you, so you cannot `docker build` on a pod (claim `runners.runpod.no-docker-in-pod`). That is why the pod starts from the image itself, and step 4 does what the Dockerfile's later lines do.

## 2. Connect

Open the pod's **Connect** tab and copy the command under "SSH over exposed TCP". It looks like `ssh root@203.0.113.7 -p 22222 -i ~/.ssh/id_ed25519`, with your pod's address and port. Run it in a terminal on your own computer.

## 3. Check the pod

On the pod. The first line must show a driver of 580 or newer for the CUDA 13 environments; if it does not, stop the pod and deploy another.

```bash
nvidia-smi --query-gpu=name,driver_version --format=csv
python3 --version
df -h . | tail -n 1
```

`python3 --version` has to say 3.11, 3.12, 3.13 or 3.14 (the grader's range, ARCHITECTURE section 9.3). The three images' Pythons are 3.12 or newer [unverified], so a different answer means the wrong image.

## 4. Set up the kit

On the pod. Edit the four lines marked `# EDIT`, then paste the blocks in order. They are the Dockerfile's steps, made by hand: uv 0.10.2 exactly, the locked environment installed with the hash of every file, and the kit beside it.

```bash
KIT_URL='https://enginespace.naigap.com/labs/enginespace-gpu-kit.zip'   # EDIT: the link on the lab's page
KIT_SHA256='0000000000000000000000000000000000000000000000000000000000000000'   # EDIT: the SHA-256 line on the lab's page
ENV_NAME='vllm'   # EDIT: vllm, sglang or nano-vllm
STAGE='tr8.replay.s1'   # EDIT: the stage you were issued a challenge for

mkdir -p "$HOME/es" && cd "$HOME/es" && \
  curl -fL --proto '=https' -o kit.zip "$KIT_URL" && \
  echo "$KIT_SHA256  kit.zip" | sha256sum -c - && \
  python3 -m zipfile -e kit.zip . && \
  cd enginespace-gpu-kit

if [ "$ENV_NAME" = "nano-vllm" ]; then apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python3-venv git; fi
export PIP_BREAK_SYSTEM_PACKAGES=1 PIP_DISABLE_PIP_VERSION_CHECK=1
export UV_PROJECT_ENVIRONMENT="$HOME/es/venv" UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
python3 -m pip install --no-cache-dir "uv==0.10.2" && \
  test "$(uv --version | cut -d ' ' -f 2)" = "0.10.2" && \
  uv sync --locked --project "envs/$ENV_NAME" && \
  . "$HOME/es/venv/bin/activate" && \
  export ENGINESPACE_KIT="$PWD"
enginespace doctor --env "$ENV_NAME"
```

`doctor` prints what a receipt will record about the pod and compares the engine, torch and the key libraries with `course.lock.json`. It exits 1 on an off-pin package or an old driver. Do not go on past a failure: a receipt made on the wrong pin does not verify.

The `&&` chain stops at `sha256sum -c`, on purpose, if the download is not the kit the site published. The shell is yours, so nothing here ends your session when a command fails: read the last lines before you go on.

## 5. Grade

On the pod, in the same shell (the variables from step 4 are still set, and so is the environment):

```bash
TOKEN='es1:tr8.replay.s1:0badc0de:ABCDEFGHJKLMNPQR:20261104:00000000'   # EDIT: the whole token from the Receipts page
ASSISTED='none'   # EDIT: none, explain or code: how much help you had
AGENT='no'   # EDIT: yes or no: whether an agent worked on the lab

LAB="${STAGE%.*}"
enginespace fetch "$LAB"
enginespace grade "$STAGE" --challenge "$TOKEN" --host-kind runpod --assisted "$ASSISTED" --agent "$AGENT"
ls -l receipts
enginespace receipt verify receipts/*.es.json.gz
```

- Leave out `enginespace fetch` for a lab whose page lists no download. It stops with a message for a lab that lists none.
- `--assisted` and `--agent` are your own declaration. Leave them out and the receipt records the most help, which costs you nothing but a weight (ASSESSMENT section 3.2). Say what is true.
- `grade` exits 1 when a check of the lab failed, and writes the bundle all the same: the site shows the failed check and its reason.
- A token is good for 14 days [estimated, ARCHITECTURE section 8.4]. The grader warns about an old one and the site refuses an expired one.

## 6. Bring the bundle home

On your own computer, with the address and port from step 2:

```bash
POD_IP='203.0.113.7'   # EDIT: the pod's address, from the Connect tab
POD_PORT='22222'   # EDIT: the pod's SSH port, from the Connect tab
KEY="$HOME/.ssh/id_ed25519"   # EDIT: your private key, if it is elsewhere

mkdir -p receipts
scp -P "$POD_PORT" -i "$KEY" "root@$POD_IP:es/enginespace-gpu-kit/receipts/*.es.json.gz" receipts/
ls -l receipts
```

Then open the Receipts page and add the file from there. The check runs in your browser (ARCHITECTURE section 8.5), and nothing is uploaded.

## 7. Stop the pod

Stop or terminate the pod in the console when you are done: it bills while it runs, and a stopped pod's disk may bill too (RunPod's pricing page says how). Your bundle is on your computer; a pod you terminate takes its disk with it.

## Trouble

- **The pod's log shows `vllm serve` or an SGLang server starting, and SSH does not answer.** The image's entrypoint runs your command as its argument. Set the pod's entrypoint to empty if the console has the field, or use RunPod's own PyTorch template, whose SSH is set up already (claim `runners.runpod.custom-template-ssh`): its Python must be 3.11 to 3.14, and steps 3 to 6 are the same. The locked environment brings its own CUDA libraries as wheels, so the template's CUDA does not decide the pins; the pod's driver still does.
- **`uv sync` stops with "no interpreter found".** The pod's Python is outside 3.11 to 3.14. `UV_PYTHON_DOWNLOADS=never` keeps uv from fetching another; pick another image.
- **`doctor` reports an off-pin package.** The lock and the kit disagree, or you ran the block outside the kit. Start again from `cd enginespace-gpu-kit`.
- **A pod that has no public IP.** `scp` fails. Redeploy with one, or copy the file with whatever file transfer the console gives you for a pod.
