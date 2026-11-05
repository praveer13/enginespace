#!/usr/bin/env python3
"""
vllm-dispatch: run the pinned vLLM's CUDA-graph dispatchers on the cases of scripts/tables/dispatch-cases.ts, and write the golden tables
(TRACKER W1-T12 check 4; GAMES.md section 3, "Invariants the tests check"; DECISIONS Q-10).

What it runs. It imports the vLLM source tree of the pinned tag, v0.33.0, and calls the code that decides which CUDA graph a batch replays:

  * MRV2, the default runner: vllm/v1/worker/gpu/cudagraph_utils.py, `CudaGraphManager.__init__` (which builds the candidate descriptors) and
    `CudaGraphManager.dispatch`, with the adapter cases from vllm/v1/worker/gpu/lora_utils.py, `get_lora_capture_cases`;
  * MRV1, the legacy runner: vllm/v1/cudagraph_dispatcher.py, `CudagraphDispatcher.__init__`, `initialize_cudagraph_keys` and `dispatch`;
  * the capture sizes: `VllmConfig._set_cudagraph_sizes` (vllm/config/vllm.py) for the engine's default list, and
    `CompilationConfig.adjust_cudagraph_sizes_for_spec_decode` for MRV1's speculative rounding;
  * the mode downgrades: `CompilationConfig.resolve_cudagraph_mode_and_sizes` (vllm/config/compilation.py).

It runs them on a CPU. None of this code touches a GPU: each is a function of a configuration and a batch's shape. What a GPU would add
is the capture itself (`CudaGraphManager.capture`), which only fills the table of graphs that `dispatch` never reads, so the script sets
`_graphs_captured` the way the end of `capture` does and leaves the rest. The configurations are plain namespaces that carry the attributes
the code reads. vLLM's own classes (the enum CUDAGraphMode, the descriptors, the managers) are the real ones. Only three things are
replaced, because they need a process group or a platform that a CPU host does not have: `get_pp_group` and `current_platform` inside
cudagraph_utils.py, and `vllm.platforms.current_platform` for the one call in `_set_cudagraph_sizes` that asks about Blackwell.

Whether a CPU-only run is enough was [unverified] (GAMES.md section 15, question 3). If this script runs to the end, it was.

How to run it (the owner, once, at the pin; about a minute):

  1. The cases (deterministic; the same bytes in every runtime):
       bun scripts/tables/dispatch-cases.ts --write /tmp/dispatch-cases.json
  2. The pinned source, as text, from the tag's tarball (the commit must be 4ba787ec9959e566d3b587a796dff07673324da5):
       curl -sSL -A 'Mozilla/5.0 (X11; Linux x86_64)' -o vllm-v0.33.0.tar.gz https://codeload.github.com/vllm-project/vllm/tar.gz/refs/tags/v0.33.0
       git get-tar-commit-id < <(gzip -dc vllm-v0.33.0.tar.gz)        # prints the commit
       mkdir vllm-src && tar -xzf vllm-v0.33.0.tar.gz -C vllm-src
  3. An environment with CPU torch and vLLM's runtime requirements, beside the repository and not in it:
       uv venv --python 3.13 /tmp/vllm-dispatch-venv
       uv pip install --python /tmp/vllm-dispatch-venv/bin/python --index-url https://download.pytorch.org/whl/cpu torch==2.14.0
       uv pip install --python /tmp/vllm-dispatch-venv/bin/python -r vllm-src/vllm-0.33.0/requirements/common.txt
  4. The run, with `-I` so that the script's own directory and the user site are not on the path:
       /tmp/vllm-dispatch-venv/bin/python -I scripts/tables/vllm-dispatch.py \
           --vllm-src vllm-src/vllm-0.33.0 --tarball vllm-v0.33.0.tar.gz \
           --cases /tmp/dispatch-cases.json --out tests/fixtures/dispatch --ran-by 'the owner'
  5. The check, and the commit (tests/sim/dispatch-tables.test.ts then asks for `DISPATCH_TABLES.status` to be 'committed'):
       bun scripts/tables/dispatch-cases.ts --check
       git add tests/fixtures/dispatch

The tarball is untrusted data until it has been read: the run executes vLLM's Python, as the task asks, and nothing else in it.

It writes `<out>/v0.33.0.json` (the results, in the order of the cases, with the provenance) and `<out>/v0.33.0.json.sha256`. Exit status:
0 when every section ran, 1 when a section failed (the others are written, and the failed one is marked), 2 for a usage error or an
import that did not work.
"""
import argparse
import datetime
import hashlib
import json
import os
import platform
import sys
import tarfile
import types

SCHEMA_CASES = 'enginespace/dispatch-cases@1'
SCHEMA_TABLE = 'enginespace/dispatch-table@1'
TABLE_FILE = 'v0.33.0.json'
EXPECTED_COMMIT = '4ba787ec9959e566d3b587a796dff07673324da5'
SCRIPT_PATH = 'scripts/tables/vllm-dispatch.py'

# The vLLM files whose code this run executes, hashed into the table so that a reader can compare them with the tag.
SOURCES = [
    'vllm/v1/worker/gpu/cudagraph_utils.py',
    'vllm/v1/worker/gpu/lora_utils.py',
    'vllm/v1/cudagraph_dispatcher.py',
    'vllm/lora/utils.py',
    'vllm/forward_context.py',
    'vllm/config/compilation.py',
    'vllm/config/vllm.py',
    'vllm/v1/attention/backend.py',
]


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def fail_usage(message):
    print('vllm-dispatch: ' + message, file=sys.stderr)
    sys.exit(2)


def read_cases(path):
    with open(path, 'rb') as handle:
        raw = handle.read()
    text = raw.decode('utf-8')
    cases = json.loads(text)
    if cases.get('schema') != SCHEMA_CASES:
        fail_usage('the cases file is not %s (its schema is %r)' % (SCHEMA_CASES, cases.get('schema')))
    # The cases file is canonical JSON and one newline. Its hash names the cases that the results answer. Check that Python's own
    # canonical form of the same data is the same text, so that the hash means the same thing on both sides.
    body = text[:-1] if text.endswith('\n') else text
    again = json.dumps(cases, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    if again != body:
        fail_usage('the cases file is not canonical JSON (json.dumps with sorted keys differs from it): write it with dispatch-cases.ts --write')
    return cases, sha256_bytes(body.encode('utf-8'))


def import_vllm(src):
    """Puts the tag's source first on the path and imports the modules the cases run. Exits 2 with the recipe if an import fails."""
    sys.path.insert(0, os.path.abspath(src))
    # The breakable-graph switch is off by default; an inherited setting would change the managers, so clear it.
    os.environ['VLLM_USE_BREAKABLE_CUDAGRAPH'] = '0'
    try:
        import vllm
        from vllm.config.compilation import CompilationConfig, CompilationMode, CUDAGraphMode
        from vllm.config.vllm import VllmConfig
        from vllm.v1.attention.backend import AttentionCGSupport
        import vllm.v1.cudagraph_dispatcher as dispatcher_v1
        import vllm.v1.worker.gpu.cudagraph_utils as manager_v2
        import vllm.v1.worker.gpu.lora_utils as lora_utils
        import vllm.platforms as platforms
    except Exception as error:  # noqa: BLE001 - any import failure means the environment is not the recipe's
        print('vllm-dispatch: importing vLLM from %s failed: %s: %s' % (src, type(error).__name__, error), file=sys.stderr)
        print('Is the environment the one in the header (CPU torch 2.14.0, and the requirements of vllm/requirements/common.txt)?', file=sys.stderr)
        sys.exit(2)
    root = os.path.abspath(src)
    if not os.path.abspath(vllm.__file__).startswith(root):
        fail_usage('vLLM was imported from %s, and not from the tag under %s: remove the installed vllm from the environment' % (vllm.__file__, root))
    return types.SimpleNamespace(
        vllm=vllm,
        CompilationConfig=CompilationConfig,
        CompilationMode=CompilationMode,
        CUDAGraphMode=CUDAGraphMode,
        VllmConfig=VllmConfig,
        AttentionCGSupport=AttentionCGSupport,
        dispatcher_v1=dispatcher_v1,
        manager_v2=manager_v2,
        lora_utils=lora_utils,
        platforms=platforms,
    )


def lora_stub(lora):
    """The `lora_config` the code reads: `max_loras` and `specialize_active_lora`; None when the engine serves no adapter."""
    if lora is None:
        return None
    return types.SimpleNamespace(max_loras=lora['maxLoras'], specialize_active_lora=lora['specializeActiveLora'])


# ---------------------------------------------------------------------------------------------------------------------------
# MRV2


def make_manager_v2(v, config):
    mode = v.CUDAGraphMode[config['mode']]
    sizes = list(config['sizes'])
    lora = config['lora']
    compilation = types.SimpleNamespace(
        cudagraph_capture_sizes=sizes,
        max_cudagraph_capture_size=(max(sizes) if sizes else 0),
        cudagraph_specialize_lora=(lora['specializeLora'] if lora is not None else True),
    )
    lora_config = lora_stub(lora)
    vllm_config = types.SimpleNamespace(
        scheduler_config=types.SimpleNamespace(max_num_seqs=config['maxNumSeqs']),
        compilation_config=compilation,
        parallel_config=types.SimpleNamespace(tensor_parallel_size=1),
        speculative_config=None,
        cache_config=types.SimpleNamespace(use_kda_recoverssm=False),
        lora_config=lora_config,
    )
    capture_cases = v.lora_utils.get_lora_capture_cases(lora_config, compilation)
    manager = v.manager_v2.CudaGraphManager(
        vllm_config,
        'cpu',
        mode,
        decode_query_len=config['decodeQueryLen'],
        lora_capture_cases=capture_cases,
        varlen_decode=False,
        ubatch_runner=None,
    )
    # The end of `capture()` sets this. `dispatch` reads the candidates that `__init__` built and nothing that capturing makes.
    manager._graphs_captured = True
    return manager


def row_v2(descriptor):
    return [
        descriptor.cg_mode.value,
        descriptor.num_tokens,
        descriptor.num_reqs,
        descriptor.uniform_token_count,
        descriptor.max_query_len,
        descriptor.num_active_loras,
        descriptor.num_ubatches,
    ]


def run_v2(v, cases):
    # The two things a CPU host lacks: the pipeline-parallel group (`get_pp_group()` asserts that it was initialised) and the platform's
    # global graph pool. Both are read once, in `CudaGraphManager.__init__`, and neither decides a dispatch.
    v.manager_v2.get_pp_group = lambda: types.SimpleNamespace(is_first_rank=True, is_last_rank=True)
    v.manager_v2.current_platform = types.SimpleNamespace(get_global_graph_pool=lambda: None)
    managers = [make_manager_v2(v, config) for config in cases['v2']['configs']]
    rows = []
    for config, reqs, tokens, uniform, loras, max_query in cases['v2']['cases']:
        try:
            descriptor = managers[config].dispatch(reqs, tokens, uniform, loras, max_query_len=max_query)
            rows.append(row_v2(descriptor))
        except Exception as error:  # noqa: BLE001 - record vLLM's own failure as the answer
            rows.append(['error', type(error).__name__])
    return rows


# ---------------------------------------------------------------------------------------------------------------------------
# MRV1


def adjusted_sizes_v1(v, config):
    """The sizes MRV1 captures for a config: with full decode graphs and a decode query length above 1, `resolve_cudagraph_mode_and_sizes` rounds them first."""
    mode = v.CUDAGraphMode[config['mode']]
    sizes = list(config['sizes'])
    query_len = config['decodeQueryLen']
    if sizes and mode.decode_mode() == v.CUDAGraphMode.FULL and query_len > 1:
        holder = types.SimpleNamespace(cudagraph_capture_sizes=sizes, max_cudagraph_capture_size=max(sizes))
        v.CompilationConfig.adjust_cudagraph_sizes_for_spec_decode(holder, query_len)
        return list(holder.cudagraph_capture_sizes)
    return sizes


def make_dispatcher_v1(v, config, sizes):
    mode = v.CUDAGraphMode[config['mode']]
    lora = config['lora']
    compilation = types.SimpleNamespace(
        cudagraph_mode=mode,
        max_cudagraph_capture_size=(max(sizes) if sizes else None),
        cudagraph_capture_sizes=list(sizes),
        compile_sizes=[],
        cudagraph_specialize_lora=(lora['specializeLora'] if lora is not None else True),
        # The assertion in __init__ asks whether attention is compiled piecewise when the mode needs piecewise graphs. The default config says it is.
        is_attention_compiled_piecewise=lambda: True,
        mode=v.CompilationMode.VLLM_COMPILE,
        splitting_ops=['vllm::unified_attention'],
    )
    vllm_config = types.SimpleNamespace(
        compilation_config=compilation,
        num_speculative_tokens=config['decodeQueryLen'] - 1,
        lora_config=lora_stub(lora),
        scheduler_config=types.SimpleNamespace(max_num_seqs=config['maxNumSeqs']),
    )
    dispatcher = v.dispatcher_v1.CudagraphDispatcher(vllm_config)
    dispatcher.initialize_cudagraph_keys(mode, uniform_decode_query_len=config['decodeQueryLen'])
    return dispatcher


def row_v1(mode, descriptor):
    return [
        mode.value,
        descriptor.num_tokens,
        descriptor.num_reqs,
        1 if descriptor.uniform else 0,
        1 if descriptor.has_lora else 0,
        descriptor.num_active_loras,
    ]


def run_v1(v, cases):
    configs = cases['v1']['configs']
    sizes = [adjusted_sizes_v1(v, config) for config in configs]
    dispatchers = [make_dispatcher_v1(v, config, sizes[i]) for i, config in enumerate(configs)]
    rows = []
    for config, tokens, uniform_decode, has_lora, loras in cases['v1']['cases']:
        try:
            mode, descriptor = dispatchers[config].dispatch(tokens, uniform_decode == 1, has_lora == 1, loras)
            rows.append(row_v1(mode, descriptor))
        except Exception as error:  # noqa: BLE001 - record vLLM's own failure as the answer
            rows.append(['error', type(error).__name__])
    return rows, sizes


# ---------------------------------------------------------------------------------------------------------------------------
# The capture sizes, and the mode downgrades


def run_sizes(v, cases):
    rows = []
    # `vllm.platforms` makes `current_platform` on each access (a module-level __getattr__), so a name set on the module wins while it is
    # there, and removing it puts the real lookup back.
    namespace = vars(v.platforms)
    had = 'current_platform' in namespace
    saved = namespace.get('current_platform')
    try:
        for case in cases['sizes']:
            compilation = types.SimpleNamespace(
                cudagraph_mode=v.CUDAGraphMode.FULL_AND_PIECEWISE,
                max_cudagraph_capture_size=None,
                cudagraph_capture_sizes=None,
            )
            holder = types.SimpleNamespace(
                model_config=types.SimpleNamespace(enforce_eager=False),
                compilation_config=compilation,
                uniform_decode_query_len=case['decodeQueryLen'],
                scheduler_config=types.SimpleNamespace(max_num_seqs=case['maxNumSeqs'], max_num_batched_tokens=case['maxBatchedTokens']),
                speculative_config=None,
                performance_mode='throughput',
            )
            # `_set_cudagraph_sizes` asks the platform whether this is a data-centre Blackwell part, which has the larger ceiling.
            v.platforms.current_platform = types.SimpleNamespace(is_device_capability_family=(lambda family, blackwell=case['blackwell']: blackwell and family == 100))
            try:
                v.VllmConfig._set_cudagraph_sizes(holder)
                rows.append(list(compilation.cudagraph_capture_sizes))
            except Exception as error:  # noqa: BLE001
                rows.append(['error', type(error).__name__])
    finally:
        if had:
            v.platforms.current_platform = saved
        else:
            namespace.pop('current_platform', None)
    return rows


def run_modes(v, cases):
    rows = []
    for case in cases['modes']:
        sizes = list(case['sizes'])
        compilation = types.SimpleNamespace(
            cudagraph_mode=v.CUDAGraphMode[case['requested']],
            cudagraph_capture_sizes=sizes,
            max_cudagraph_capture_size=max(sizes),
            mode=v.CompilationMode.VLLM_COMPILE,
            use_inductor_graph_partition=False,
        )
        compilation.splitting_ops_contain_attention = (lambda attention=case['attentionPiecewise']: attention)
        compilation.adjust_cudagraph_sizes_for_spec_decode = types.MethodType(v.CompilationConfig.adjust_cudagraph_sizes_for_spec_decode, compilation)
        try:
            resolved = v.CompilationConfig.resolve_cudagraph_mode_and_sizes(
                compilation,
                v.AttentionCGSupport[case['support']],
                'the attention backend',
                case['decodeQueryLen'],
                use_v2_model_runner=(case['runner'] == 'mrv2'),
                kv_cache_config=None,
                max_num_reqs=None,
                is_profiling=False,
                piecewise_capture_available=True,
            )
            rows.append({'mode': resolved.name, 'sizes': list(compilation.cudagraph_capture_sizes)})
        except ValueError:
            rows.append('error')
    return rows


# ---------------------------------------------------------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description='Run the pinned vLLM CUDA-graph dispatchers on the dispatch cases and write the golden tables.')
    parser.add_argument('--vllm-src', required=True, help="the vLLM source tree of the tag: the directory that holds the 'vllm' package")
    parser.add_argument('--cases', required=True, help='the cases file that dispatch-cases.ts --write made')
    parser.add_argument('--out', required=True, help='the directory to write v0.33.0.json and v0.33.0.json.sha256 to (tests/fixtures/dispatch)')
    parser.add_argument('--tarball', help="the tag's tarball, to read the commit it was made at from its header")
    parser.add_argument('--ran-by', default='the owner', help="who runs it, for the provenance: 'the owner' or 'the build agent'")
    parser.add_argument('--smoke', action='store_true', help='import vLLM, build one manager of each runner and dispatch one case, print it, and write nothing')
    args = parser.parse_args()

    cases, cases_sha = read_cases(args.cases)
    if cases['pin']['commit'] != EXPECTED_COMMIT:
        fail_usage('the cases name commit %s, and this script is for %s' % (cases['pin']['commit'], EXPECTED_COMMIT))

    tarball = None
    if args.tarball:
        with tarfile.open(args.tarball) as archive:
            commit = archive.pax_headers.get('comment', '')
        if commit != EXPECTED_COMMIT:
            fail_usage('the tarball was made at commit %r, and the pin is %s' % (commit, EXPECTED_COMMIT))
        with open(args.tarball, 'rb') as handle:
            tarball = {'commit': commit, 'sha256': sha256_bytes(handle.read())}

    v = import_vllm(args.vllm_src)

    if args.smoke:
        print('vLLM %s imported from %s' % (v.vllm.__version__, v.vllm.__file__))
        manager = make_manager_v2(v, cases['v2']['configs'][0])
        print('MRV2 manager built; dispatch(8 requests, 8 tokens, uniform 1) ->', row_v2(manager.dispatch(8, 8, 1, 0)))
        config = cases['v1']['configs'][0]
        dispatcher = make_dispatcher_v1(v, config, adjusted_sizes_v1(v, config))
        mode, descriptor = dispatcher.dispatch(8, True, False, 0)
        print('MRV1 dispatcher built; dispatch(8 tokens, uniform decode) ->', row_v1(mode, descriptor))
        return 0

    failed = []
    results = {}

    def section(name, run):
        try:
            return run()
        except Exception as error:  # noqa: BLE001 - one failed section must not lose the others
            failed.append('%s: %s: %s' % (name, type(error).__name__, error))
            return None

    results['v2'] = section('v2', lambda: run_v2(v, cases))
    v1 = section('v1', lambda: run_v1(v, cases))
    results['v1'], results['v1Sizes'] = (v1 if v1 is not None else (None, None))
    results['sizes'] = section('sizes', lambda: run_sizes(v, cases))
    results['modes'] = section('modes', lambda: run_modes(v, cases))
    for name, value in results.items():
        if value is None:
            results[name] = []

    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    with open(os.path.abspath(__file__), 'rb') as handle:
        script_sha = sha256_bytes(handle.read())
    sources = {}
    for relative in SOURCES:
        with open(os.path.join(args.vllm_src, relative), 'rb') as handle:
            sources[relative] = sha256_bytes(handle.read())
    try:
        import torch
        torch_version = torch.__version__
    except Exception:  # noqa: BLE001
        torch_version = 'not imported'
    meta = {
        'schema': SCHEMA_TABLE,
        'pin': cases['pin'],
        'casesSha256': cases_sha,
        'provenance': '[measured by %s on a CPU host, %s%s]' % (args.ran_by, today, '' if args.ran_by == 'the owner' else "; the owner's confirmation is open (Q-10)"),
        'generatedAt': today,
        'host': {
            'python': platform.python_version(),
            'torch': torch_version,
            'vllm': getattr(v.vllm, '__version__', 'unknown'),
            'platform': platform.platform(),
            'machine': platform.machine(),
            'device': 'cpu',
        },
        'script': {'path': SCRIPT_PATH, 'sha256': script_sha},
        'sources': sources,
        'counts': {
            'v2': len(results['v2']),
            'v1': len(results['v1']),
            'sizes': len(results['sizes']),
            'modes': len(results['modes']),
        },
    }
    if tarball is not None:
        meta['tarball'] = tarball
    if failed:
        meta['failed'] = failed

    table = {'meta': meta, 'results': results}
    text = json.dumps(table, sort_keys=True, separators=(',', ':'), ensure_ascii=False) + '\n'
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, TABLE_FILE)
    with open(path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)
    digest = sha256_bytes(text.encode('utf-8'))
    with open(path + '.sha256', 'w', encoding='utf-8', newline='\n') as handle:
        handle.write('%s  %s\n' % (digest, TABLE_FILE))
    print('wrote %s (%d bytes, SHA-256 %s)' % (path, len(text.encode('utf-8')), digest))
    print('MRV2 %d rows, MRV1 %d rows, sizes %d rows, modes %d rows' % (meta['counts']['v2'], meta['counts']['v1'], meta['counts']['sizes'], meta['counts']['modes']))
    if failed:
        for line in failed:
            print('FAILED ' + line, file=sys.stderr)
        return 1
    print('next: bun scripts/tables/dispatch-cases.ts --check')
    return 0


if __name__ == '__main__':
    sys.exit(main())
