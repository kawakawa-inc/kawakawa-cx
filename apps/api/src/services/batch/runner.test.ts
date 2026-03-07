/**
 * Tests for batch process runner
 */
import { describe, it, expect, vi } from 'vitest'
import { runBatchProcesses } from './runner.js'
import type { BatchProcess } from './types.js'

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

function createProcess(overrides: Partial<BatchProcess> = {}): BatchProcess {
  return {
    id: 'test-process',
    description: 'Test process',
    shouldRun: vi.fn().mockResolvedValue(true),
    execute: vi.fn().mockResolvedValue({ processed: 1, skipped: 0, errors: [] }),
    ...overrides,
  }
}

describe('runBatchProcesses', () => {
  it('returns empty result when no processes', async () => {
    const result = await runBatchProcesses([])

    expect(result.ran).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
    expect(result.failed).toHaveLength(0)
  })

  it('skips processes where shouldRun returns false', async () => {
    const process = createProcess({
      id: 'skip-me',
      shouldRun: vi.fn().mockResolvedValue(false),
    })

    const result = await runBatchProcesses([process])

    expect(result.skipped).toEqual(['skip-me'])
    expect(result.ran).toHaveLength(0)
    expect(process.execute).not.toHaveBeenCalled()
  })

  it('runs processes where shouldRun returns true', async () => {
    const process = createProcess({
      id: 'run-me',
      execute: vi.fn().mockResolvedValue({ processed: 5, skipped: 2, errors: [] }),
    })

    const result = await runBatchProcesses([process])

    expect(result.ran).toHaveLength(1)
    expect(result.ran[0]).toEqual({
      id: 'run-me',
      result: { processed: 5, skipped: 2, errors: [] },
    })
    expect(process.execute).toHaveBeenCalled()
  })

  it('captures errors from execute without stopping other processes', async () => {
    const failProcess = createProcess({
      id: 'fail-me',
      execute: vi.fn().mockRejectedValue(new Error('kaboom')),
    })
    const okProcess = createProcess({ id: 'ok-process' })

    const result = await runBatchProcesses([failProcess, okProcess])

    expect(result.failed).toEqual([{ id: 'fail-me', error: 'kaboom' }])
    expect(result.ran).toHaveLength(1)
    expect(result.ran[0].id).toBe('ok-process')
  })

  it('reports processes with non-fatal errors in result', async () => {
    const process = createProcess({
      id: 'partial',
      execute: vi.fn().mockResolvedValue({
        processed: 3,
        skipped: 0,
        errors: ['item 4 failed'],
      }),
    })

    const result = await runBatchProcesses([process])

    expect(result.ran).toHaveLength(1)
    expect(result.ran[0].result.errors).toEqual(['item 4 failed'])
  })

  it('runs multiple processes in order', async () => {
    const order: string[] = []
    const p1 = createProcess({
      id: 'first',
      execute: vi.fn().mockImplementation(async () => {
        order.push('first')
        return { processed: 1, skipped: 0, errors: [] }
      }),
    })
    const p2 = createProcess({
      id: 'second',
      execute: vi.fn().mockImplementation(async () => {
        order.push('second')
        return { processed: 1, skipped: 0, errors: [] }
      }),
    })

    await runBatchProcesses([p1, p2])

    expect(order).toEqual(['first', 'second'])
  })
})
