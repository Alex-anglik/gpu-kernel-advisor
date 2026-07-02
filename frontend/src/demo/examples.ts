import type { DerivedMetrics, MetricValue } from '../api'
import capturedRaw from './captured.json'
import { DEMO_EXAMPLES, type DemoExample } from './manifest'

export interface CapturedResult {
  metrics: Record<string, MetricValue>
  derived: DerivedMetrics
  report: string | null
}

export interface Captured {
  gpu: string
  capturedAt: string
  results: Record<string, CapturedResult | undefined>
}

export const captured = capturedRaw as unknown as Captured

const sources = import.meta.glob('./kernels/*.cu', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export function demoSource(file: string): string {
  return sources[`./kernels/${file}`] ?? ''
}

export { DEMO_EXAMPLES }
export type { DemoExample }
