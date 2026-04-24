/**
 * Shared formatters for burn/repair views.
 *
 * The functions here are pure so they can be used from child components
 * (CorpOverviewPanel, CorpDashboard) without needing access to the
 * parent's refs.
 */

export function formatNumber(n: number): string {
  if (n === 0) return '-'
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2)
}

/**
 * Daily repair consumption — amortize the total repair cost across repairDays.
 * When repairDays=0 (repair now), the whole amount is "due today".
 */
export function repairDaily(m: { repairTotal: number }, repairDays: number): number {
  return repairDays > 0 ? m.repairTotal / repairDays : m.repairTotal
}

/** Net/Day including repair drain; positive = surplus, negative = shortage. */
export function netDaily(
  m: {
    burnDaily: number
    inputsDaily: number
    productionDaily: number
    repairTotal: number
  },
  repairDays: number
): number {
  return m.productionDaily - m.burnDaily - m.inputsDaily - repairDaily(m, repairDays)
}
