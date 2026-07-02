import type { DerivedMetrics, MetricValue } from './api'
import { attainableGflops, boundAt, RIDGE_AI, T4 } from './rooflineMath'

export const GEMINI_MODEL = 'gemini-2.5-flash'

export interface ReportInput {
  source: string
  kernelName: string
  metrics: Record<string, MetricValue>
  derived: DerivedMetrics
}

const FENCE = '```'

export function buildPrompt({ source, kernelName, metrics, derived }: ReportInput): string {
  const ai = derived.arithmetic_intensity_flop_per_byte
  const gflops = derived.achieved_gflops
  const attainable = ai !== null ? attainableGflops(ai) : null
  const pct = gflops !== null && attainable ? ((gflops / attainable) * 100).toFixed(1) : null
  const bound = ai !== null ? boundAt(ai) : 'unknown'
  const branchTargets = metrics['smsp__sass_branch_targets.sum']?.value ?? null
  const smClockHz = metrics['sm__cycles_elapsed.avg.per_second']?.value ?? null
  const smClockMhz = smClockHz !== null ? Math.round(smClockHz / 1e6) : null

  return `You are an expert GPU performance engineer reviewing one CUDA kernel launch profiled with NVIDIA Nsight Compute on a Tesla T4.

T4 hardware context: Turing (SM75), 40 SMs, GDDR6 at ${T4.peakGbps} GB/s peak, peak FP32 ≈ ${(T4.peakGflopsFp32 / 1000).toFixed(1)} TFLOP/s at ${T4.boostClockMhz} MHz boost, roofline ridge ≈ ${RIDGE_AI.toFixed(1)} FLOP/byte, 4 MB L2, 64 KB unified L1/shared per SM, 64K 32-bit registers per SM, max 1024 resident threads (32 warps) per SM.

STRICT GROUNDING RULES:
1. Base every quantitative statement on the measurements below and cite the value you used. Never invent, estimate, or extrapolate numbers that are not provided.
2. Branch data: branch_targets = ${branchTargets ?? 'not measured'}. If it is 0, the "branch target uniformity 0%" reading is vacuous (the code compiled to predication) and MUST NOT be interpreted as divergence. The divergence evidence is "active threads per instruction" (32 = no divergence).
3. FLOP counts cover FP32 fadd/fmul/ffma only (FFMA = 2 FLOPs). If the source is dominated by other work (FP64, integer, tensor cores, transcendentals), state that the roofline placement understates compute work and qualify your analysis.
4. SM clock during this launch: ${smClockMhz ?? 'unknown'} MHz (base ${T4.baseClockMhz}, boost ${T4.boostClockMhz}). A low clock during memory-bound kernels is normal DVFS behaviour — do not report it as a problem by itself.
5. If the data cannot justify a suggestion, omit the suggestion. Fewer well-grounded items beat a padded list.
6. Do not propose fixes the metrics already rule out (e.g. do not suggest improving coalescing when sectors-per-request is already ≈ 4).

ROOFLINE PLACEMENT (derived from the measurements):
${
  derived.fp32_flops === 0
    ? '- Zero FP32 FLOPs measured — this kernel is pure data movement. The roofline placement is undefined and GFLOP/s comparisons are meaningless here; analyse it purely as a bandwidth/cache problem.'
    : `- Arithmetic intensity: ${ai?.toFixed(4) ?? 'unknown'} FLOP/byte → ${bound}-bound region
- Achieved ${gflops?.toFixed(2) ?? 'unknown'} GFLOP/s of ${attainable?.toFixed(2) ?? 'unknown'} GFLOP/s attainable at this intensity (${pct ?? 'unknown'}%)`
}

NSIGHT COMPUTE MEASUREMENTS (one launch of "${kernelName}"):
${JSON.stringify(metrics, null, 2)}

DERIVED:
${JSON.stringify(derived, null, 2)}

KERNEL SOURCE (complete program; the profiled kernel is "${kernelName}"):
${FENCE}cuda
${source}
${FENCE}

OUTPUT exactly these markdown sections:
## Diagnosis
2–4 sentences: the primary bottleneck and how close the kernel is to its relevant roof.
## Evidence
Bulleted; each bullet pairs one measured value with its interpretation.
## Ranked optimisations
Numbered, most impactful first. Each item: the change, the measured value that motivates it, and the expected direction of impact. If the kernel is already near its attainable roof, say so honestly and focus on algorithmic options — or state plainly that no kernel-level change will help.
## Already good
Brief bullets for healthy metrics worth preserving.`
}

export async function generateReport(apiKey: string, input: ReportInput): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(input) }] }],
      generationConfig: { temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.error?.message) detail += ` — ${body.error.message}`
    } catch {
      /* body wasn't JSON; the status alone will have to do */
    }
    throw new Error(detail)
  }
  const data = await res.json()
  const text: string | undefined = data.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('')
  if (!text) throw new Error('empty response from Gemini')
  return text
}
