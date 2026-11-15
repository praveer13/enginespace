#!/usr/bin/env bash
# Locks the four engine environments and exports each lock as a hashed requirements.txt (ARCHITECTURE section 9.2, W2-T04).
#
#   bash labs/envs/relock.sh           lock and export: run it after a pin of course.lock.json or of a pyproject.toml changes
#   bash labs/envs/relock.sh --check   change nothing: fail when a uv.lock is stale or a requirements.txt is not what `uv export` gives now
#
# It needs uv 0.10.2 and the network (metadata only: it never installs an environment, and a GPU environment's wheels are gigabytes).
# nano-vllm declares Python <3.13, so its lock is made with 3.12, the course's default (ARCHITECTURE section 9.3).
#
# requirements.txt leaves out the grader (a path) and nano-vllm (a git commit): pip cannot hash either one under --require-hashes, so the Dockerfile and the
# docs install them in a step of their own, `pip install --no-deps` (ARCHITECTURE section 9.3).
set -euo pipefail

mode=write
case "${1:-}" in
  "") ;;
  --check) mode=check ;;
  *) echo "usage: relock.sh [--check]" >&2; exit 2 ;;
esac

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
want="$(uv --version | cut -d ' ' -f 2)"
if [ "$want" != "0.10.2" ]; then
  echo "relock.sh needs uv 0.10.2 (ARCHITECTURE section 10.3), and this is uv $want" >&2
  exit 3
fi

failed=0
for env in cpu vllm sglang nano-vllm; do
  dir="$here/$env"
  python_args=()
  if [ "$env" = nano-vllm ]; then python_args=(--python 3.12); fi
  skip=(--no-emit-package enginespace-grader)
  if [ "$env" = nano-vllm ]; then skip+=(--no-emit-package nano-vllm); fi
  export_to() {
    uv export --project "$dir" --frozen --format requirements-txt --no-emit-project --no-header "${skip[@]}" "${python_args[@]}" --output-file "$1" >/dev/null
  }
  if [ "$mode" = write ]; then
    uv lock --project "$dir" "${python_args[@]}"
    export_to "$dir/requirements.txt"
  else
    if ! uv lock --check --project "$dir" "${python_args[@]}"; then echo "labs/envs/$env/uv.lock is stale" >&2; failed=1; continue; fi
    scratch="$(mktemp)"
    export_to "$scratch"
    if ! cmp -s "$scratch" "$dir/requirements.txt"; then echo "labs/envs/$env/requirements.txt is not what uv export gives from the lock" >&2; failed=1; fi
    rm -f "$scratch"
  fi
done
exit "$failed"
