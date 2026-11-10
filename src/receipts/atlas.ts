/*
 * The hardware atlas, as the physics floors of rule 9 read it (ARCHITECTURE §8.5 rule 9, ASSESSMENT §6.4; W2-T09 wrote the claims, W2-T08 built the
 * floors). For each GPU that a learner owns or rents: the name by which NVML reports it, the peak memory bandwidth in GB/s, and the highest dense
 * Tensor Core peak of any precision in TFLOPS, each as NVIDIA states it in the documents that `content/claims/hardware/*.yaml` quotes.
 *
 * The claims are the source, and this table is their compact form: a claim file is YAML read at build time and never at run time (A§2.3), and
 * `public/claims.json` is half a megabyte, where the worker that checks a receipt has room for 14 rows. So the numbers are copied here, and
 * tests/receipts/atlas.test.ts compiles the claims and holds every row to them: the name is the `product-name` claim, the bandwidth the `mem-bw` claim,
 * and the peak the largest of the `fp32`, `<precision>-dense` and `<precision>-listed` claims (a rate NVIDIA lists without saying whether it counts
 * sparsity is kept, since as a ceiling it holds either way). A claim that moves fails that test until this table follows it. The comment on each row
 * names the claims it was made from.
 *
 * Each row's peak is the largest of its precisions, so a ceiling made from it holds whatever the model's precision is. The floors add a margin to it
 * (packages/verify/atlas.ts, `PEAK_MARGIN_PERMILLE`), because whether a GeForce or an RTX PRO card can boost past the clock its peak is stated at is not
 * stated in those documents [unverified].
 */
import type { Atlas } from '@es/verify'

export const ATLAS: Atlas = [
  { name: 'NVIDIA H100 80GB HBM3', bandwidthGBps: 3350, peakTflops: 1979 }, // h100-sxm: mem-bw, fp8-dense
  { name: 'NVIDIA H100 PCIe', bandwidthGBps: 2000, peakTflops: 1513 }, // h100-pcie: mem-bw, fp8-dense
  { name: 'NVIDIA H200', bandwidthGBps: 4800, peakTflops: 1979 }, // h200-sxm: mem-bw, fp8-dense
  { name: 'NVIDIA A100-SXM4-40GB', bandwidthGBps: 1555, peakTflops: 624 }, // a100-40-sxm: mem-bw, int8-dense
  { name: 'NVIDIA A100-PCIE-40GB', bandwidthGBps: 1555, peakTflops: 624 }, // a100-40-pcie: mem-bw, int8-dense
  { name: 'NVIDIA A100-SXM4-80GB', bandwidthGBps: 2039, peakTflops: 624 }, // a100-80-sxm: mem-bw, int8-dense
  { name: 'NVIDIA A100 80GB PCIe', bandwidthGBps: 1935, peakTflops: 624 }, // a100-80-pcie: mem-bw, int8-dense
  { name: 'NVIDIA GeForce RTX 4090', bandwidthGBps: 1008, peakTflops: 660.6 }, // rtx4090: mem-bw, fp8-dense
  { name: 'NVIDIA L4', bandwidthGBps: 300, peakTflops: 242.5 }, // l4: mem-bw, fp8-dense
  { name: 'NVIDIA L40S', bandwidthGBps: 864, peakTflops: 733 }, // l40s: mem-bw, fp8-dense
  { name: 'NVIDIA GeForce RTX 5090', bandwidthGBps: 1792, peakTflops: 1676 }, // rtx5090: mem-bw, fp4-dense
  { name: 'NVIDIA RTX PRO 6000 Blackwell Server Edition', bandwidthGBps: 1597, peakTflops: 4000 }, // rtx-pro-6000-server: mem-bw, fp4-listed (4 PFLOPS)
  { name: 'NVIDIA RTX PRO 6000 Blackwell Workstation Edition', bandwidthGBps: 1792, peakTflops: 2015.2 }, // rtx-pro-6000-workstation: mem-bw, fp4-dense
  { name: 'NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition', bandwidthGBps: 1792, peakTflops: 1755.7 }, // rtx-pro-6000-max-q: mem-bw, fp4-dense
]
