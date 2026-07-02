import type { DerivedMetrics, MetricValue } from '../api'

interface Props {
  metrics: Record<string, MetricValue>
  derived: DerivedMetrics
}

const sig = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 })

function fmtMetric(v: number | null, unit: string | null): string {
  if (v === null) return '—'
  switch (unit) {
    case 'byte':
      return v >= 1e6 ? `${sig.format(v / 1e6)} MB` : `${sig.format(v)} B`
    case 'byte/s':
      return `${sig.format(v / 1e9)} GB/s`
    case 'ns':
      return v >= 1e6 ? `${sig.format(v / 1e6)} ms` : `${sig.format(v / 1e3)} µs`
    case 'hz':
      return `${sig.format(v / 1e6)} MHz`
    case '%':
      return `${v.toFixed(1)}%`
    case 'inst':
      // exact SASS-level counts — never round these
      return `${v.toLocaleString('en-US')} inst`
    default:
      return sig.format(v) + (unit ? ` ${unit}` : '')
  }
}

const TABLE_ROWS: { key: string; label: string; hint?: string }[] = [
  { key: 'gpu__time_duration.sum', label: 'Kernel duration' },
  { key: 'sm__warps_active.avg.pct_of_peak_sustained_active', label: 'Achieved occupancy' },
  { key: 'sm__throughput.avg.pct_of_peak_sustained_elapsed', label: 'SM throughput (SOL)' },
  { key: 'dram__throughput.avg.pct_of_peak_sustained_elapsed', label: 'DRAM throughput (SOL)' },
  { key: 'dram__bytes.sum', label: 'DRAM traffic' },
  { key: 'dram__bytes.sum.per_second', label: 'DRAM bandwidth' },
  { key: 'l1tex__t_sector_hit_rate.pct', label: 'L1/tex hit rate' },
  { key: 'lts__t_sector_hit_rate.pct', label: 'L2 hit rate' },
  {
    key: 'l1tex__average_t_sectors_per_request_pipe_lsu_mem_global_op_ld.ratio',
    label: 'Sectors per global-load request',
    hint: '4 = fully coalesced 32-bit accesses · 32 = fully strided',
  },
  {
    key: 'smsp__thread_inst_executed_per_inst_executed.ratio',
    label: 'Active threads per instruction',
    hint: '32 = no divergence',
  },
  {
    key: 'smsp__sass_average_branch_targets_threads_uniform.pct',
    label: 'Branch target uniformity',
    hint: '0% alongside 32 threads/inst usually means no qualifying branches, not divergence',
  },
  { key: 'smsp__sass_branch_targets.sum', label: 'Branch targets executed' },
  { key: 'launch__registers_per_thread', label: 'Registers per thread' },
  { key: 'sm__cycles_elapsed.avg.per_second', label: 'SM clock during kernel' },
  { key: 'smsp__sass_thread_inst_executed_op_fadd_pred_on.sum', label: 'FADD (thread insts)' },
  { key: 'smsp__sass_thread_inst_executed_op_fmul_pred_on.sum', label: 'FMUL (thread insts)' },
  { key: 'smsp__sass_thread_inst_executed_op_ffma_pred_on.sum', label: 'FFMA (thread insts)' },
]

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-xl font-semibold text-zinc-100 mt-1">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function Bar({ label, pct }: { label: string; pct: number | null }) {
  const clamped = pct === null ? 0 : Math.max(0, Math.min(100, pct))
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-200 font-mono">{pct === null ? '—' : `${pct.toFixed(1)}%`}</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded overflow-hidden">
        <div className="h-full bg-indigo-500 rounded" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}

export function MetricsSummary({ metrics, derived }: Props) {
  const val = (key: string) => metrics[key]?.value ?? null

  const threadsPerInst = val('smsp__thread_inst_executed_per_inst_executed.ratio')
  const warpEff = threadsPerInst === null ? null : (threadsPerInst / 32) * 100

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Card
          label="Kernel duration"
          value={derived.duration_ms === null ? '—' : `${sig.format(derived.duration_ms)} ms`}
        />
        <Card
          label="Achieved compute"
          value={
            derived.achieved_gflops === null ? '—' : `${sig.format(derived.achieved_gflops)} GFLOP/s`
          }
          sub="FP32, FFMA ×2"
        />
        <Card
          label="Achieved DRAM BW"
          value={
            derived.achieved_dram_gbps === null ? '—' : `${sig.format(derived.achieved_dram_gbps)} GB/s`
          }
          sub="of 320 GB/s peak"
        />
        <Card
          label="Arithmetic intensity"
          value={
            derived.arithmetic_intensity_flop_per_byte === null
              ? '—'
              : sig.format(derived.arithmetic_intensity_flop_per_byte)
          }
          sub="FLOP / DRAM byte"
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
        <Bar label="DRAM throughput (% of peak)" pct={val('dram__throughput.avg.pct_of_peak_sustained_elapsed')} />
        <Bar label="SM throughput (% of peak)" pct={val('sm__throughput.avg.pct_of_peak_sustained_elapsed')} />
        <Bar label="Achieved occupancy" pct={val('sm__warps_active.avg.pct_of_peak_sustained_active')} />
        <Bar label="Warp execution efficiency" pct={warpEff} />
      </div>
    </div>
  )
}

export function MetricsTable({ metrics }: { metrics: Record<string, MetricValue> }) {
  return (
    <table className="w-full text-sm">
        <tbody>
          {TABLE_ROWS.filter((row) => metrics[row.key] !== undefined).map((row) => (
            <tr key={row.key} className="border-b border-zinc-800/60">
              <td className="py-1.5 pr-2 text-zinc-400">
                {row.label}
                {row.hint && <div className="text-xs text-zinc-600">{row.hint}</div>}
                <div className="text-[10px] text-zinc-700 font-mono">{row.key}</div>
              </td>
              <td className="py-1.5 text-right font-mono text-zinc-200 whitespace-nowrap align-top">
                {fmtMetric(metrics[row.key].value, metrics[row.key].unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
  )
}
