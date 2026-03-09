export { runBatchProcesses } from './runner.js'
export type { BatchProcess, BatchResult } from './types.js'
export type { RunnerResult } from './runner.js'

// Import all batch processes
import { migrateOrphanReservations } from './migrateOrphanReservations.js'
import { fixReservationCounterparty } from './fixReservationCounterparty.js'
import type { BatchProcess } from './types.js'

/**
 * All registered batch processes, in execution order.
 */
export const batchProcesses: BatchProcess[] = [
  migrateOrphanReservations,
  fixReservationCounterparty,
]
