// Naive transpose, gather formulation: the write side is coalesced, but
// adjacent lanes READ 16 KB apart (walking a row-major matrix down a column).
// Expect sectors-per-global-load-request near 32 (vs 4 when coalesced).
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

__global__ void transposeNaive(const float* __restrict__ in,
                               float* __restrict__ out, int n)
{
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n * n) {
        int r = i % n;              // row index walks fastest across lanes...
        int c = i / n;
        out[i] = in[r * n + c];     // ...so this load strides by n floats per lane
    }
}

int main()
{
    const int n = 4096;             // 4096x4096 floats = 64 MB per array
    const int total = n * n;
    const size_t bytes = (size_t)total * sizeof(float);

    float *in, *out;
    CUDA_CHECK(cudaMalloc(&in, bytes));
    CUDA_CHECK(cudaMalloc(&out, bytes));

    float* h = (float*)malloc(bytes);
    for (int i = 0; i < total; ++i) h[i] = (float)(i % 1024);
    CUDA_CHECK(cudaMemcpy(in, h, bytes, cudaMemcpyHostToDevice));

    transposeNaive<<<(total + 255) / 256, 256>>>(in, out, n);
    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaDeviceSynchronize());

    float* hout = (float*)malloc(bytes);
    CUDA_CHECK(cudaMemcpy(hout, out, bytes, cudaMemcpyDeviceToHost));
    for (int i = 0; i < total; i += 997) {   // sampled check
        int r = i % n, c = i / n;
        if (hout[i] != h[r * n + c]) { fprintf(stderr, "FAIL at %d\n", i); return 1; }
    }
    printf("PASS\n");
    return 0;
}
