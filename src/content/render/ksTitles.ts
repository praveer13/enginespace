/*
 * The titles of the kernelspace lessons that the course names, as kernelspace prints them at the commit the course reads it at (d478f91, the
 * heading of each lesson's page). A page that names one says its title and links it, so the learner reads what the lesson is called and not
 * where it sits in kernelspace's numbering. A ref with no row here reads as `kernelspace T5.L7` (model.ts), and tests/content/ks-titles.test.ts
 * holds this table to every lesson ref the course's own files use.
 */
export const KERNELSPACE_TITLES: Readonly<Record<string, string>> = {
  'T0.L3': 'Benchmark: Row- vs Column-Major Traversal',
  'T0.L4': 'AoS vs SoA, False Sharing & Cache Lines',
  'T0.L6': 'Reading a Flame Graph (and Making One)',
  'T1.L4': 'Fragmentation: Internal vs External',
  'T2.L1': 'Processes, Threads & Context Switches',
  'T2.L3': 'Swapping & Eviction Policies',
  'T2.L4': 'Scheduling & Admission Control',
  'T3.L6': "Why NVIDIA Dynamo's Data Plane Is Rust",
  'T4.L3': 'The Roofline Model',
  'T4.L6': 'Matmul, Tiling & FlashAttention as Cache Blocking',
  'T5.L1': 'Transformer Internals for Systems Engineers',
  'T5.L3': 'Inference vs Training; Prefill vs Decode',
  'T5.L4': 'KV Cache Math',
  'T5.L5': 'PagedAttention Deep Dive',
  'T5.L6': 'Prefix Caching: The Free Lunch',
  'T5.L7': 'Continuous Batching',
  'T5.L8': 'Speculative Decoding & Chunked Prefill',
  'T5.L10': 'The Production Stack: vLLM, SGLang, TRT-LLM, Dynamo',
  'T6.L6': 'Speculative Decoding in Production: MTP, EAGLE, and the Acceptance Economy',
  'T6.L8': 'Agents, Structured Output, and Cache Locality',
  'T6.L9': 'Multi-LoRA Serving: One Base, Many Tenants',
  'T7.L1': 'The Objective Function: Goodput, SLOs, and Honest Metrics',
  'T7.L2': 'Benchmarking Methodology: Measure Like You Mean It',
  'T7.L4': 'Unit Economics: $/Mtok, tok/MW, and the 545% Margin Day',
}
