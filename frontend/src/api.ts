export interface MetricValue {
  value: number | null
  unit: string | null
}

export interface DerivedMetrics {
  fp32_flops: number | null
  arithmetic_intensity_flop_per_byte: number | null
  achieved_gflops: number | null
  achieved_dram_gbps: number | null
  duration_ms: number | null
}

export type ProfileResponse =
  | { status: 'ok'; metrics: Record<string, MetricValue>; derived: DerivedMetrics }
  | { status: 'compile_error'; stderr: string }
  | {
      status: 'profile_error'
      detail: string
      ncu_stdout_tail?: string
      ncu_stderr_tail?: string
    }

export interface HealthResponse {
  status: string
  gpu: string
}

const joinUrl = (base: string, path: string) => base.replace(/\/+$/, '') + path

export async function checkHealth(baseUrl: string): Promise<HealthResponse> {
  const res = await fetch(joinUrl(baseUrl, '/health'), {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// nvcc + ncu replay passes take 5–15 s on the Colab side; the generous timeout
// covers a cold runtime or a queued request behind another profile.
export async function profileKernel(
  baseUrl: string,
  source: string,
  kernelName: string,
): Promise<ProfileResponse> {
  const res = await fetch(joinUrl(baseUrl, '/profile'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, kernel_name: kernelName }),
    signal: AbortSignal.timeout(300_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
