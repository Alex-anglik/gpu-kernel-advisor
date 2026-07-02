import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { profileKernel, type ProfileResponse } from './api'
import { BackendBar, type HealthState } from './components/BackendBar'
import { MetricsSummary, MetricsTable } from './components/MetricsDashboard'
import { ReportSection } from './components/ReportSection'
import { Roofline } from './components/Roofline'
import { DEFAULT_KERNEL_NAME, DEFAULT_SOURCE } from './template'

export default function App() {
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem('backendUrl') ?? '')
  const [health, setHealth] = useState<HealthState>('unknown')
  const [gpuName, setGpuName] = useState('')
  const [source, setSource] = useState(DEFAULT_SOURCE)
  const [kernelName, setKernelName] = useState(DEFAULT_KERNEL_NAME)
  const [profiling, setProfiling] = useState(false)
  const [result, setResult] = useState<ProfileResponse | null>(null)
  // snapshot of what was actually profiled — the editor may be edited afterwards,
  // and the LLM report must describe the profiled source, not the current buffer
  const [profiled, setProfiled] = useState<{ source: string; kernelName: string } | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  function handleUrlChange(url: string) {
    setBackendUrl(url)
    localStorage.setItem('backendUrl', url)
    setHealth('unknown')
  }

  async function runProfile() {
    setProfiling(true)
    setResult(null)
    setFetchError(null)
    try {
      setResult(await profileKernel(backendUrl, source, kernelName))
      setProfiled({ source, kernelName })
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e))
    } finally {
      setProfiling(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-200">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 shrink-0">
        <h1 className="font-semibold text-sm">GPU Kernel Advisor</h1>
        <span className="text-xs text-zinc-500">NVIDIA T4 · Nsight Compute</span>
        <BackendBar
          url={backendUrl}
          onUrlChange={handleUrlChange}
          health={health}
          gpuName={gpuName}
          onHealthResult={(state, gpu) => {
            setHealth(state)
            setGpuName(gpu)
          }}
        />
      </header>

      <main className="flex-1 grid grid-cols-2 min-h-0">
        <section className="flex flex-col border-r border-zinc-800 min-h-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0">
            <label className="text-xs text-zinc-500">kernel</label>
            <input
              value={kernelName}
              onChange={(e) => setKernelName(e.target.value)}
              spellCheck={false}
              className="w-40 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono
                         focus:outline-none focus:border-indigo-500"
              data-testid="kernel-name"
            />
            <button
              onClick={runProfile}
              disabled={profiling || health !== 'ok' || !kernelName.trim()}
              className="ml-auto text-xs px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500
                         font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="profile-btn"
            >
              {profiling ? 'Profiling…' : 'Profile on T4'}
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Editor
              defaultLanguage="cpp"
              theme="vs-dark"
              value={source}
              onChange={(v) => setSource(v ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                padding: { top: 8 },
              }}
            />
          </div>
        </section>

        <section className="overflow-y-auto p-4 min-h-0">
          {profiling && (
            <div className="text-sm text-zinc-400" data-testid="profiling-note">
              Compiling and profiling on the T4 — nvcc plus ncu replay passes take
              roughly 5–15 seconds…
            </div>
          )}

          {!profiling && !result && !fetchError && (
            <div className="text-sm text-zinc-500">
              {health === 'ok'
                ? 'Edit the kernel and hit "Profile on T4".'
                : 'Paste your Colab tunnel URL top-right and hit Connect.'}
            </div>
          )}

          {fetchError && (
            <div className="text-sm text-red-400" data-testid="fetch-error">
              Request failed: {fetchError}. Is the Colab notebook still running? Tunnel
              URLs change on every restart.
            </div>
          )}

          {result?.status === 'compile_error' && (
            <div data-testid="compile-error">
              <div className="text-sm text-red-400 mb-2 font-medium">nvcc: compilation failed</div>
              <pre className="text-xs bg-zinc-900 border border-red-900/50 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                {result.stderr}
              </pre>
            </div>
          )}

          {result?.status === 'profile_error' && (
            <div data-testid="profile-error">
              <div className="text-sm text-red-400 mb-2 font-medium">ncu: profiling failed</div>
              <pre className="text-xs bg-zinc-900 border border-red-900/50 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                {result.detail}
                {result.ncu_stderr_tail ? `\n\n${result.ncu_stderr_tail}` : ''}
              </pre>
            </div>
          )}

          {result?.status === 'ok' && (
            <div className="space-y-6" data-testid="metrics-dashboard">
              <MetricsSummary metrics={result.metrics} derived={result.derived} />
              {result.derived.arithmetic_intensity_flop_per_byte !== null &&
                result.derived.achieved_gflops !== null && (
                  <Roofline
                    ai={result.derived.arithmetic_intensity_flop_per_byte}
                    gflops={result.derived.achieved_gflops}
                    smClockHz={result.metrics['sm__cycles_elapsed.avg.per_second']?.value ?? null}
                  />
                )}
              {profiled && (
                <ReportSection
                  input={{
                    source: profiled.source,
                    kernelName: profiled.kernelName,
                    metrics: result.metrics,
                    derived: result.derived,
                  }}
                />
              )}
              <MetricsTable metrics={result.metrics} />
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
