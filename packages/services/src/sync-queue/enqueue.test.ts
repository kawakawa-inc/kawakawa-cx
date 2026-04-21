import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@kawakawa/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  syncJobs: {
    id: 'id',
    userId: 'user_id',
    jobType: 'job_type',
    status: 'status',
    priority: 'priority',
    notifyOnComplete: 'notify_on_complete',
    payload: 'payload',
  },
}))

vi.mock('./worker.js', () => ({
  wakeWorker: vi.fn(),
}))

import { db } from '@kawakawa/db'
import { enqueue } from './enqueue.js'

function mockSelectResult(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  }
  vi.mocked(db.select).mockReturnValue(chain as unknown as ReturnType<typeof db.select>)
}

function mockInsertResult(id: number) {
  const chain = {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id }]),
    }),
  }
  vi.mocked(db.insert).mockReturnValue(chain as unknown as ReturnType<typeof db.insert>)
}

describe('enqueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a new job when no duplicate exists', async () => {
    mockSelectResult([])
    mockInsertResult(99)

    const id = await enqueue({
      jobType: 'user-inventory',
      userId: 1,
      source: 'user',
    })

    expect(id).toBe(99)
    expect(db.insert).toHaveBeenCalled()
  })

  it('returns the existing job ID when a matching pending job is found', async () => {
    mockSelectResult([
      {
        id: 42,
        userId: 1,
        jobType: 'user-inventory',
        priority: 200,
        notifyOnComplete: true,
        payload: {},
      },
    ])

    const id = await enqueue({ jobType: 'user-inventory', userId: 1, source: 'user' })
    expect(id).toBe(42)
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('upgrades priority when a higher-priority request arrives for an existing job', async () => {
    const updateChain = {
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }
    vi.mocked(db.update).mockReturnValue(updateChain as unknown as ReturnType<typeof db.update>)

    mockSelectResult([
      {
        id: 42,
        userId: 1,
        jobType: 'user-inventory',
        priority: 100, // system-scheduled already queued
        notifyOnComplete: false,
        payload: {},
      },
    ])

    await enqueue({
      jobType: 'user-inventory',
      userId: 1,
      source: 'user', // user-requested → default priority 200
      notifyOnComplete: true,
    })

    expect(updateChain.set).toHaveBeenCalledWith({
      priority: 200,
      notifyOnComplete: true,
    })
  })

  it('dedups planet-detail jobs by planetNaturalId', async () => {
    mockSelectResult([
      {
        id: 7,
        userId: 1,
        jobType: 'planet-detail',
        priority: 100,
        notifyOnComplete: false,
        payload: { planetNaturalId: 'CB-282d' },
      },
    ])

    const id = await enqueue({
      jobType: 'planet-detail',
      userId: 1,
      payload: { planetNaturalId: 'CB-282d' },
    })
    expect(id).toBe(7)
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('does NOT dedup planet-detail jobs for different planets', async () => {
    mockSelectResult([
      {
        id: 7,
        userId: 1,
        jobType: 'planet-detail',
        priority: 100,
        notifyOnComplete: false,
        payload: { planetNaturalId: 'CB-282d' },
      },
    ])
    mockInsertResult(8)

    const id = await enqueue({
      jobType: 'planet-detail',
      userId: 1,
      payload: { planetNaturalId: 'CH-771a' },
    })
    expect(id).toBe(8)
    expect(db.insert).toHaveBeenCalled()
  })
})
