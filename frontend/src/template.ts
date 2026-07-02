// Default editor content: the coalesced vector-add example. Kernels must be
// complete programs — main() allocates real buffers and launches with a
// realistic problem size, because the profiler measures exactly what runs.
import vecAddSource from './demo/kernels/vec_add.cu?raw'

export const DEFAULT_KERNEL_NAME = 'vecAdd'
export const DEFAULT_SOURCE = vecAddSource
