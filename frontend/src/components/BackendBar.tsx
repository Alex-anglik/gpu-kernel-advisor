import { useState } from 'react'
import { checkHealth } from '../api'

export type HealthState = 'unknown' | 'checking' | 'ok' | 'error'

interface Props {
  url: string
  onUrlChange: (url: string) => void
  health: HealthState
  gpuName: string
  onHealthResult: (state: HealthState, gpu: string) => void
}

const DOT: Record<HealthState, string> = {
  unknown: 'bg-zinc-600',
  checking: 'bg-amber-400 animate-pulse',
  ok: 'bg-emerald-400',
  error: 'bg-red-500',
}

export function BackendBar({ url, onUrlChange, health, gpuName, onHealthResult }: Props) {
  const [error, setError] = useState('')

  async function connect() {
    setError('')
    onHealthResult('checking', '')
    try {
      const res = await checkHealth(url)
      onHealthResult('ok', res.gpu)
    } catch (e) {
      onHealthResult('error', '')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex items-center gap-2 ml-auto">
      {health === 'error' && <span className="text-xs text-red-400">{error || 'unreachable'}</span>}
      {health === 'ok' && <span className="text-xs text-emerald-400">{gpuName}</span>}
      <span className={`inline-block w-2 h-2 rounded-full ${DOT[health]}`} data-testid="health-dot" />
      <input
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://….trycloudflare.com"
        spellCheck={false}
        className="w-80 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono
                   focus:outline-none focus:border-indigo-500"
        data-testid="backend-url"
      />
      <button
        onClick={connect}
        disabled={!url || health === 'checking'}
        className="text-xs px-3 py-1 rounded bg-zinc-800 border border-zinc-700 hover:bg-zinc-700
                   disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="connect-btn"
      >
        Connect
      </button>
    </div>
  )
}
