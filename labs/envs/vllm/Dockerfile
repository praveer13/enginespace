# The vllm environment as an image (ARCHITECTURE section 9.3, W2-T04). Build it from the labs/ folder of the repository, or from the root of a kit:
#
#   docker build -f envs/vllm/Dockerfile -t enginespace-vllm .
#
# The base is vLLM's official image at the pinned tag (D-035). That the tag exists on Docker Hub, and that the namespace is the project's, are the claims vllm.image.openai-tag and vllm.image.official ([measured] 2026-11-15, content/claims/runners.yaml).
# The Dockerfile builds are left to the owner's smoke run (W2-T12): nothing in CI builds them, and no one has built this one [unverified].
#
# The locked environment is installed from uv.lock, with the hash of every file, into /opt/venv, and the kit goes beside it. The base image brings the CUDA
# libraries and the tools of its vendor; the Python packages that run are the locked ones. A base is never trusted for a pin: `enginespace doctor` in the
# container checks the engine and the libraries against course.lock.json.
FROM vllm/vllm-openai:v0.33.0

ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_INPUT=1

# uv 0.10.2 exactly, from PyPI, the version that every lock of the course is made with (ARCHITECTURE section 10.3).
RUN python3 -m pip install --no-cache-dir "uv==0.10.2" && test "$(uv --version | cut -d ' ' -f 2)" = "0.10.2"

WORKDIR /kit
# The grader is a path dependency of every environment, so it sits at ../../grader from the environment's folder, as it does in the repository and in a kit.
COPY grader /kit/grader
COPY envs/vllm /kit/envs/vllm
RUN uv sync --locked --project envs/vllm 

ENV PATH="/opt/venv/bin:$PATH"
# The official vLLM and SGLang images start a server. A lab starts its own, so the image starts nothing.
ENTRYPOINT []
CMD ["bash"]
