import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { GEMINI_MODEL, generateReport, type ReportInput } from '../gemini'

interface Props {
  input: ReportInput
  // pre-generated report shipped with demo examples; the user can still
  // regenerate live with their own key
  cannedReport?: string | null
}

export function ReportSection({ input, cannedReport }: Props) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('geminiApiKey') ?? '')
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<string | null>(cannedReport ?? null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setGenerating(true)
    setError(null)
    setReport(null)
    try {
      setReport(await generateReport(apiKey, input))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3" data-testid="report-section">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs text-zinc-500">
          LLM diagnosis <span className="text-zinc-600">({GEMINI_MODEL})</span>
        </div>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value)
            localStorage.setItem('geminiApiKey', e.target.value)
          }}
          placeholder="Gemini API key"
          spellCheck={false}
          className="ml-auto w-56 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs font-mono
                     focus:outline-none focus:border-indigo-500"
          data-testid="gemini-key"
        />
        <button
          onClick={run}
          disabled={generating || !apiKey.trim()}
          className="text-xs px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 font-medium
                     disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="report-btn"
        >
          {generating ? 'Generating…' : 'Generate report'}
        </button>
      </div>

      {generating && (
        <div className="text-xs text-zinc-500">Asking Gemini to interpret the measured metrics…</div>
      )}

      {error && (
        <div className="text-xs text-red-400" data-testid="report-error">
          Gemini request failed: {error}. The metrics above are unaffected.
        </div>
      )}

      {report && (
        <div className="prose prose-invert prose-sm max-w-none" data-testid="report-md">
          <ReactMarkdown>{report}</ReactMarkdown>
        </div>
      )}

      {!report && !generating && !error && (
        <div className="text-xs text-zinc-600">
          The report is generated from the measured metrics and roofline placement above — the
          dashboard stays fully functional without it.
        </div>
      )}
    </div>
  )
}
