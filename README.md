# GPU Kernel Advisor

Paste a CUDA kernel, profile it on a real NVIDIA T4 with Nsight Compute, and get a
grounded performance report: hardware counter metrics, a roofline plot, and an
LLM-generated diagnosis with ranked optimisations — where every number is measured,
never invented.

**Core principle:** the metrics layer and the reasoning layer are strictly separated.
The dashboard renders real `ncu` counters and works fully without the LLM; the LLM
(Gemini) only *interprets* measurements it is given, under explicit grounding rules.

## How it works

```
Browser (React + Monaco + D3 roofline)
   │  POST /profile  { source, kernel_name }
   ▼
cloudflared quick tunnel
   │
   ▼
FastAPI inside a Google Colab notebook (free T4)
   nvcc -O3 -arch=sm_75  →  ncu --metrics …  →  parsed, sanitized JSON
```

- **Backend** — [`backend/backend_colab.ipynb`](backend/backend_colab.ipynb): FastAPI
  service next to the GPU. Compiles the submitted program, profiles the named kernel
  with Nsight Compute, parses either `ncu` CSV layout, and returns strict JSON
  (metrics + derived roofline quantities). Structured `compile_error` /
  `profile_error` responses instead of 500s.
- **Frontend** — [`frontend/`](frontend): React 19 + TypeScript + Vite + Tailwind.
  Monaco editor seeded with a self-contained harness template, metrics dashboard,
  log-log roofline (T4: 320 GB/s, 8.1 TFLOP/s FP32, ridge ≈ 25.3 FLOP/byte), and the
  Gemini report section.
- **Spike** — [`spike/ncu_colab_spike.ipynb`](spike/ncu_colab_spike.ipynb): the
  de-risking notebook that proved GPU performance counters are readable in Colab
  (cells run as root, which satisfies `RmProfilingAdminOnly`), with a fallback ladder
  if that ever changes.

## Run it

**1. Backend (needs a Google account, nothing else):**

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Alex-anglik/gpu-kernel-advisor/blob/main/backend/backend_colab.ipynb)

Runtime → T4 GPU → Run all. The tunnel cell prints a public
`https://….trycloudflare.com` URL. Keep the tab open — the notebook *is* the server,
and the URL changes on every restart.

**2. Frontend:**

```sh
cd frontend
npm install
npm run dev
```

Paste the tunnel URL top-right → Connect → edit the kernel → **Profile on T4**.
For the LLM report, paste a [Gemini API key](https://aistudio.google.com/apikey)
(free tier) in the report card. Both are stored in `localStorage` only.

The submitted source must be a **complete program**: `main()` allocates buffers and
launches the kernel with a realistic problem size — the profiler measures exactly
what runs. The editor's default template shows the shape.

## What gets measured

Per launch: duration, achieved occupancy, SM/DRAM speed-of-light %, DRAM bytes and
bandwidth, L1/L2 hit rates, sectors-per-global-load-request (coalescing: 4 = perfectly
coalesced 32-bit accesses, 32 = fully strided), active threads per instruction
(divergence), branch counts, FP32 fadd/fmul/ffma instruction counts (roofline y-axis,
FFMA = 2 FLOPs), registers per thread, and the actual SM clock during the run.

Interpretation subtleties the tool handles explicitly:

- **Branch uniformity is vacuous without branches.** Predicated code reports
  0% branch-target uniformity with zero branch targets; the LLM prompt gates on the
  branch count so it never mis-diagnoses divergence. Divergence evidence is
  threads-per-instruction (32 = none).
- **Roofline roofs are boost-clock-nominal.** A 70 W T4 runs well below the 1590 MHz
  boost figure under load (DVFS keeps memory-bound kernels near the 585 MHz base
  clock); the measured SM clock is collected per run and shown on the plot.
- **Exact counts stay exact.** SASS instruction counters are never sig-fig rounded
  in the UI.

## Honest limitations

- The tunnel URL is ephemeral and the Colab runtime idles out — this is a
  bring-your-own-GPU developer tool, not a hosted service. A public `/profile`
  endpoint is arbitrary code execution; running it on your own throwaway Colab VM is
  the point.
- One profile at a time (`ncu` serialises on the performance counters); a round trip
  is ~5–15 s (nvcc + counter replay passes).
- FLOP counting covers FP32 only; FP64/int/tensor-dominated kernels get a qualified
  roofline placement.

## Roadmap

- Demo mode: pre-captured profiles + reports for contrasting example kernels
  (coalesced vs. strided, divergent vs. uniform, naive vs. tiled matmul) so the
  deployed site works with no backend.
- Vercel deployment of the static frontend.
