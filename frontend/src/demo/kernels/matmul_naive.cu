// Naive matmul: no shared-memory tiling, every operand fetched through the
// cache hierarchy on demand. The classic optimisation target — expect heavy
// L1/L2 traffic, an arithmetic intensity well above the streaming kernels,
// and performance far from the FP32 roof.
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

__global__ void matmulNaive(const float* __restrict__ A,
                            const float* __restrict__ B,
                            float* __restrict__ C, int N)
{
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    if (row < N && col < N) {
        float acc = 0.0f;
        for (int k = 0; k < N; ++k)
            acc = fmaf(A[row * N + k], B[k * N + col], acc);
        C[row * N + col] = acc;
    }
}

int main()
{
    const int N = 1024;
    const size_t bytes = (size_t)N * N * sizeof(float);

    float *A, *B, *C;
    CUDA_CHECK(cudaMalloc(&A, bytes));
    CUDA_CHECK(cudaMalloc(&B, bytes));
    CUDA_CHECK(cudaMalloc(&C, bytes));

    float* h = (float*)malloc(bytes);
    for (int i = 0; i < N * N; ++i) h[i] = 1.0f;
    CUDA_CHECK(cudaMemcpy(A, h, bytes, cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(B, h, bytes, cudaMemcpyHostToDevice));

    dim3 block(16, 16);
    dim3 grid(N / block.x, N / block.y);
    matmulNaive<<<grid, block>>>(A, B, C, N);
    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaDeviceSynchronize());

    CUDA_CHECK(cudaMemcpy(h, C, bytes, cudaMemcpyDeviceToHost));
    // A = B = all-ones, so every C entry is exactly N (1024 is exact in fp32)
    for (int i = 0; i < N * N; i += 4099) {
        if (h[i] != (float)N) { fprintf(stderr, "FAIL at %d: %f\n", i, h[i]); return 1; }
    }
    printf("PASS\n");
    return 0;
}
