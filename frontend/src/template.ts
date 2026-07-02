// Default editor content: a complete, self-contained program. The backend
// requires main() — it compiles and runs the whole file, then ncu profiles the
// kernel named in the "kernel name" field.
export const DEFAULT_KERNEL_NAME = 'vecAdd'

export const DEFAULT_SOURCE = String.raw`// Paste or edit your kernel below. Keep the file self-contained:
// main() must allocate real buffers and launch the kernel with a
// realistic problem size — the profiler measures exactly what runs.
#include <cstdio>
#include <cuda_runtime.h>

#define CUDA_CHECK(call)                                                      \
    do {                                                                      \
        cudaError_t err_ = (call);                                            \
        if (err_ != cudaSuccess) {                                            \
            fprintf(stderr, "CUDA error: %s at %s:%d\n",                      \
                    cudaGetErrorString(err_), __FILE__, __LINE__);            \
            return 1;                                                         \
        }                                                                     \
    } while (0)

__global__ void vecAdd(const float* __restrict__ a,
                       const float* __restrict__ b,
                       float* __restrict__ c, int n)
{
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) c[i] = a[i] + b[i];
}

int main()
{
    const int n = 1 << 24;
    const size_t bytes = (size_t)n * sizeof(float);

    float *a, *b, *c;
    CUDA_CHECK(cudaMalloc(&a, bytes));
    CUDA_CHECK(cudaMalloc(&b, bytes));
    CUDA_CHECK(cudaMalloc(&c, bytes));

    float* h = (float*)malloc(bytes);
    for (int i = 0; i < n; ++i) h[i] = 1.0f;
    CUDA_CHECK(cudaMemcpy(a, h, bytes, cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(b, h, bytes, cudaMemcpyHostToDevice));

    vecAdd<<<(n + 255) / 256, 256>>>(a, b, c, n);
    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaDeviceSynchronize());

    printf("done\n");
    return 0;
}
`
