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

type ReportInput = Parameters<typeof generateReport>[1]

// Gemini free tier throws transient 429/5xx under load — retry with backoff
// rather than losing a whole capture run to one blip.
async function reportWithRetry(key: string, input: ReportInput): Promise<string | null> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await generateReport(key, input)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const transient = /HTTP (429|5\d\d)/.test(msg)
      if (!transient || attempt === 4) {
        console.warn(`report failed permanently: ${msg}`)
        return null
      }
      const wait = attempt * 20
      console.log(`\n  transient error (${msg}) — retrying in ${wait}s …`)
      await sleep(wait * 1000)
    }
  }
  return null
}

async function main() {
  const health = await (await fetch(`${base}/health`)).json()
  console.log(`backend ok — GPU: ${health.gpu}`)

  // reports from a previous (possibly partial) run survive as fallbacks
  let previous: Record<string, { report?: string | null } | undefined> = {}
  try {
    previous = JSON.parse(readFileSync(outPath, 'utf8')).results ?? {}
  } catch {
    /* no previous capture */
  }

  const results: Record<string, unknown> = {}
  const missingReports: string[] = []

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

    let report: string | null = previous[ex.id]?.report ?? null
    if (geminiKey) {
      process.stdout.write(`  generating report … `)
      const fresh = await reportWithRetry(geminiKey, {
        source,
        kernelName: ex.kernelName,
        metrics: profile.metrics,
        derived: profile.derived,
      })
      if (fresh) {
        report = fresh
        console.log(`${fresh.length} chars`)
      } else if (report) {
        console.log('kept report from previous capture')
      }
      await sleep(5000) // stay friendly to free-tier rate limits
    }
    if (!report) missingReports.push(ex.id)

    results[ex.id] = { metrics: profile.metrics, derived: profile.derived, report }

    // write after every kernel so a mid-run failure never loses finished work
    writeFileSync(
      outPath,
      JSON.stringify(
        { gpu: health.gpu, capturedAt: new Date().toISOString().slice(0, 10), results },
        null,
        2,
      ) + '\n',
    )
  }

  console.log(`wrote ${outPath}`)
  if (missingReports.length > 0) {
    console.log(
      geminiKey
        ? `reports still missing for: ${missingReports.join(', ')} — rerun to retry (existing ones are kept)`
        : '(no Gemini key given — reports are null; rerun with a key to fill them)',
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
