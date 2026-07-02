// Capture real T4 profiles (and optionally Gemini reports) for the demo examples.
//
//   npm run capture -- <backend-url> [gemini-api-key]
//
// Profiles every kernel in src/demo/manifest.ts through the live backend and
// writes src/demo/captured.json. With a Gemini key it also pre-generates the
// reports, reusing the exact prompt builder the UI uses — canned reports and
// live reports go through identical grounding rules.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ProfileResponse } from '../src/api'
import { generateReport } from '../src/gemini'
import { DEMO_EXAMPLES } from '../src/demo/manifest'

const here = dirname(fileURLToPath(import.meta.url))
const kernelsDir = join(here, '../src/demo/kernels')
const outPath = join(here, '../src/demo/captured.json')

const [backendUrl, geminiKey] = process.argv.slice(2)
if (!backendUrl) {
  console.error('usage: npm run capture -- <backend-url> [gemini-api-key]')
  process.exit(1)
}
const base = backendUrl.replace(/\/+$/, '')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const health = await (await fetch(`${base}/health`)).json()
  console.log(`backend ok — GPU: ${health.gpu}`)

  const results: Record<string, unknown> = {}

  for (const ex of DEMO_EXAMPLES) {
    const source = readFileSync(join(kernelsDir, ex.file), 'utf8')
    process.stdout.write(`profiling ${ex.id} (${ex.kernelName}) … `)

    const res = await fetch(`${base}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, kernel_name: ex.kernelName }),
    })
    const profile = (await res.json()) as ProfileResponse
    if (profile.status !== 'ok') {
      console.error(`\n${ex.id} failed:`, JSON.stringify(profile, null, 2))
      process.exit(1)
    }

    const m = profile.metrics
    console.log(
      `${profile.derived.duration_ms?.toFixed(3)} ms · ` +
        `sectors/req ${m['l1tex__average_t_sectors_per_request_pipe_lsu_mem_global_op_ld.ratio']?.value} · ` +
        `threads/inst ${m['smsp__thread_inst_executed_per_inst_executed.ratio']?.value} · ` +
        `DRAM SOL ${m['dram__throughput.avg.pct_of_peak_sustained_elapsed']?.value}%`,
    )

    let report: string | null = null
    if (geminiKey) {
      process.stdout.write(`  generating report … `)
      report = await generateReport(geminiKey, {
        source,
        kernelName: ex.kernelName,
        metrics: profile.metrics,
        derived: profile.derived,
      })
      console.log(`${report.length} chars`)
      await sleep(5000) // stay friendly to free-tier rate limits
    }

    results[ex.id] = { metrics: profile.metrics, derived: profile.derived, report }
  }

  writeFileSync(
    outPath,
    JSON.stringify(
      { gpu: health.gpu, capturedAt: new Date().toISOString().slice(0, 10), results },
      null,
      2,
    ) + '\n',
  )
  console.log(`wrote ${outPath}`)
  if (!geminiKey) {
    console.log('(no Gemini key given — reports are null; rerun with a key to fill them)')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
