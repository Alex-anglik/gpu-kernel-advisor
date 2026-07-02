// Genuine intra-warp divergence: odd lanes run a 200-step FMA chain while
// even lanes do one add, so every warp serialises both paths.
// Expect active-threads-per-instruction well below 32 and a real branch count
// (contrast with predicated kernels, where branch metrics are vacuous).
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

__global__ void divergentBranch(const float* __restrict__ in,
                                float* __restrict__ out, int n)
{
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= n) return;
    float x = in[i];
    if (threadIdx.x & 1) {
        // odd lanes: long dependent FMA chain — too heavy to if-convert
        for (int k = 0; k < 200; ++k) x = fmaf(x, 1.000001f, 1e-7f);
    } else {
        // even lanes: trivial path
        x = x + 1.0f;
    }
    out[i] = x;
}

int main()
{
    const int n = 1 << 22;
    const size_t bytes = (size_t)n * sizeof(float);

    float *in, *out;
    CUDA_CHECK(cudaMalloc(&in, bytes));
    CUDA_CHECK(cudaMalloc(&out, bytes));

    float* h = (float*)malloc(bytes);
    for (int i = 0; i < n; ++i) h[i] = 1.0f;
    CUDA_CHECK(cudaMemcpy(in, h, bytes, cudaMemcpyHostToDevice));

    divergentBranch<<<(n + 255) / 256, 256>>>(in, out, n);
    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaDeviceSynchronize());

    CUDA_CHECK(cudaMemcpy(h, out, bytes, cudaMemcpyDeviceToHost));
    // blockDim is even, so global-index parity == lane parity: even i took the add path
    for (int i = 0; i < n; i += 2) {
        if (h[i] != 2.0f) { fprintf(stderr, "FAIL at %d: %f\n", i, h[i]); return 1; }
    }
    printf("PASS\n");
    return 0;
}
