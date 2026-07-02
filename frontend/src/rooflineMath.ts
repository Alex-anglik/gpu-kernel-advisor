// Single source of truth for T4 roofline constants and placement math —
// the plot and the LLM prompt must never disagree about these numbers.
export const T4 = {
  peakGflopsFp32: 8100, // at 1590 MHz boost clock — optimistic for a 70 W card
  peakGbps: 320,
  baseClockMhz: 585,
  boostClockMhz: 1590,
}

export const RIDGE_AI = T4.peakGflopsFp32 / T4.peakGbps // ≈ 25.3 FLOP/byte

export function attainableGflops(ai: number): number {
  return Math.min(T4.peakGbps * ai, T4.peakGflopsFp32)
}

export function boundAt(ai: number): 'memory' | 'compute' {
  return ai < RIDGE_AI ? 'memory' : 'compute'
}
