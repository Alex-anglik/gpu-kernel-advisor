// Pure metadata — imported both by the browser bundle (examples.ts) and by the
// node capture script, so it must not touch Vite-specific or DOM APIs.
export interface DemoExample {
  id: string
  title: string
  description: string
  kernelName: string
  file: string
}

export const DEMO_EXAMPLES: DemoExample[] = [
  {
    id: 'vec-add',
    title: 'Vector add — coalesced baseline',
    description:
      'Streams three arrays at ~90% of DRAM peak. A kernel with nothing left to fix — the honest answer is "algorithmic change or nothing".',
    kernelName: 'vecAdd',
    file: 'vec_add.cu',
  },
  {
    id: 'transpose-naive',
    title: 'Naive transpose — strided reads',
    description:
      'Adjacent lanes read 16 KB apart. Watch sectors-per-load-request blow out from 4 toward 32.',
    kernelName: 'transposeNaive',
    file: 'transpose_naive.cu',
  },
  {
    id: 'divergent-branch',
    title: 'Divergent branch — split warps',
    description:
      'Odd lanes run a 200-step FMA chain, even lanes one add: real divergence, visible in active threads per instruction.',
    kernelName: 'divergentBranch',
    file: 'divergent_branch.cu',
  },
  {
    id: 'matmul-naive',
    title: 'Naive matmul — no tiling',
    description:
      'Every operand refetched through the cache hierarchy. The classic shared-memory tiling target.',
    kernelName: 'matmulNaive',
    file: 'matmul_naive.cu',
  },
]
