import { scaleLog } from 'd3-scale'
import { attainableGflops, boundAt, RIDGE_AI, T4 } from '../rooflineMath'

interface Props {
  ai: number
  gflops: number
  smClockHz: number | null
}

const W = 560
const H = 300
const M = { l: 52, r: 20, t: 16, b: 40 }

function decades(min: number, max: number): number[] {
  const out: number[] = []
  for (let e = Math.ceil(Math.log10(min) - 1e-9); 10 ** e <= max * 1.0001; e++) {
    out.push(10 ** e)
  }
  return out
}

const fmtTick = (v: number) => (v >= 1000 ? `${v / 1000}k` : v.toString())
const sig = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 })

export function Roofline({ ai, gflops, smClockHz }: Props) {
  const xMin = Math.min(0.01, ai / 4)
  const xMax = Math.max(100, ai * 4)
  const yMin = Math.min(1, gflops / 4)
  const yMax = T4.peakGflopsFp32 * 2

  const x = scaleLog().domain([xMin, xMax]).range([M.l, W - M.r])
  const y = scaleLog().domain([yMin, yMax]).range([H - M.b, M.t])

  const attainable = attainableGflops(ai)
  const pct = (gflops / attainable) * 100
  const bound = boundAt(ai)

  const roof = [
    `M ${x(xMin)},${y(T4.peakGbps * xMin)}`,
    `L ${x(RIDGE_AI)},${y(T4.peakGflopsFp32)}`,
    `L ${x(xMax)},${y(T4.peakGflopsFp32)}`,
  ].join(' ')

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4" data-testid="roofline">
      <div className="text-xs text-zinc-500 mb-2">Roofline — T4 FP32</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {decades(xMin, xMax).map((t) => (
          <g key={`x${t}`}>
            <line x1={x(t)} x2={x(t)} y1={M.t} y2={H - M.b} stroke="#27272a" />
            <text x={x(t)} y={H - M.b + 16} textAnchor="middle" fontSize="10" fill="#71717a">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        {decades(yMin, yMax).map((t) => (
          <g key={`y${t}`}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#27272a" />
            <text x={M.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#71717a">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#a1a1aa">
          Arithmetic intensity (FLOP / DRAM byte)
        </text>
        <text
          x={12}
          y={(M.t + H - M.b) / 2}
          textAnchor="middle"
          fontSize="10"
          fill="#a1a1aa"
          transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`}
        >
          GFLOP/s
        </text>

        {/* ridge marker */}
        <line
          x1={x(RIDGE_AI)}
          x2={x(RIDGE_AI)}
          y1={y(T4.peakGflopsFp32)}
          y2={H - M.b}
          stroke="#3f3f46"
          strokeDasharray="2 4"
        />

        {/* roofs */}
        <path d={roof} fill="none" stroke="#a1a1aa" strokeWidth="1.5" />
        <text
          x={x(0.06)}
          y={y(T4.peakGbps * 0.06) - 8}
          fontSize="10"
          fill="#a1a1aa"
          transform={`rotate(-31 ${x(0.06)} ${y(T4.peakGbps * 0.06) - 8})`}
        >
          DRAM {T4.peakGbps} GB/s
        </text>
        <text x={W - M.r - 4} y={y(T4.peakGflopsFp32) - 6} textAnchor="end" fontSize="10" fill="#a1a1aa">
          FP32 {(T4.peakGflopsFp32 / 1000).toFixed(1)} TFLOP/s (boost)
        </text>

        {/* gap from kernel to its attainable roof */}
        {pct < 98 && (
          <line
            x1={x(ai)}
            x2={x(ai)}
            y1={y(gflops)}
            y2={y(attainable)}
            stroke="#818cf8"
            strokeDasharray="3 3"
            opacity="0.6"
          />
        )}

        {/* the kernel */}
        <circle cx={x(ai)} cy={y(gflops)} r="5" fill="#818cf8" stroke="#09090b" strokeWidth="1.5" />
        <text x={x(ai) + 9} y={y(gflops) + 4} fontSize="11" fill="#c7d2fe">
          {sig.format(gflops)} GFLOP/s · {pct.toFixed(0)}% of roof
        </text>
      </svg>
      <div className="text-xs text-zinc-500 mt-2" data-testid="roofline-caption">
        AI {sig.format(ai)} FLOP/B → <span className="text-zinc-300">{bound}-bound</span> region
        (ridge ≈ {RIDGE_AI.toFixed(1)}) · achieved {sig.format(gflops)} of {sig.format(attainable)}{' '}
        GFLOP/s attainable ({pct.toFixed(1)}%). Roofs are nominal boost-clock peaks
        {smClockHz !== null &&
          `; SM clock during this run: ${Math.round(smClockHz / 1e6)} MHz (base ${T4.baseClockMhz}, boost ${T4.boostClockMhz})`}
        .
      </div>
    </div>
  )
}
