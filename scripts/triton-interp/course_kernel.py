# The course's own Triton kernels (TR0 lesson 4), written for the interpreter. Run: python -I scripts/triton-interp/course_kernel.py
import os
os.environ.setdefault("TRITON_INTERPRET", "1")  # before triton is imported: the programs run one by one, in Python, on the CPU
import torch, triton, triton.language as tl

@triton.jit
def scale(x_ptr, y_ptr, n, factor, BLOCK: tl.constexpr):
    pid = tl.program_id(0)                    # which tile this program owns
    offs = pid * BLOCK + tl.arange(0, BLOCK)  # the elements its lanes touch
    mask = offs < n                           # the lanes past the end are off
    tl.store(y_ptr + offs, tl.load(x_ptr + offs, mask=mask) * factor, mask=mask)
    if pid == tl.num_programs(0) - 1:         # show the last program, the one with masked lanes
        tl.device_print("last program offs", offs)
        tl.device_print("last program mask", mask)

@triton.jit
def scale_2d(x_ptr, y_ptr, m, n, stride_m, stride_n, factor, BM: tl.constexpr, BN: tl.constexpr):
    offs_m = tl.program_id(0) * BM + tl.arange(0, BM)
    offs_n = tl.program_id(1) * BN + tl.arange(0, BN)
    mask = (offs_m[:, None] < m) & (offs_n[None, :] < n)
    ptrs = offs_m[:, None] * stride_m + offs_n[None, :] * stride_n   # lesson 1's address sum
    tl.store(y_ptr + ptrs, tl.load(x_ptr + ptrs, mask=mask) * factor, mask=mask)

n, block = 10, 4
x, y = torch.arange(1.0, n + 1), torch.zeros(n)
programs = triton.cdiv(n, block)
scale[(programs,)](x, y, n, 2.0, BLOCK=block)
assert torch.equal(y, x * 2), "every element is written once"
print(f"1-D: n={n} BLOCK={block} programs={programs} lanes={programs * block} masked={programs * block - n}")
m, k, bm, bn = 5, 6, 2, 4
xt = torch.arange(1.0, m * k + 1).view(k, m).t()          # a view: shape (5, 6), strides (1, 5)
yt = torch.zeros_like(xt)                                 # the same strides
grid = (triton.cdiv(m, bm), triton.cdiv(k, bn))
scale_2d[grid](xt, yt, m, k, xt.stride(0), xt.stride(1), 2.0, BM=bm, BN=bn)
assert torch.equal(yt, xt * 2), "a transposed view reaches the kernel through its strides"
print(f"2-D: shape=({m}, {k}) strides={tuple(xt.stride())} BLOCK=({bm}, {bn}) grid={grid} masked={grid[0] * grid[1] * bm * bn - m * k}")
