import { Controller, Get, Post, Path, Route, Security, Tags, Request, SuccessResponse } from 'tsoa'
import { randomUUID } from 'crypto'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import { syncUserAll, type SyncUserAllResult } from '../services/fio/sync-user-all.js'
import * as userSettingsService from '../services/userSettingsService.js'

// In-memory job store
interface SyncJob {
  id: string
  userId: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  result: SyncUserAllResult | null
  error: string | null
  startedAt: Date
  completedAt: Date | null
}

const jobStore = new Map<string, SyncJob>()
const JOB_TTL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Clean up expired jobs
 */
function cleanupJobs(): void {
  const now = Date.now()
  for (const [id, job] of jobStore) {
    if (now - job.startedAt.getTime() > JOB_TTL_MS) {
      jobStore.delete(id)
    }
  }
}

// Response types for TSOA
interface SyncJobStartResponse {
  jobId: string
  status: 'pending'
}

interface SyncJobStatusResponse {
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result: SyncUserAllResult | null
  error: string | null
  startedAt: string
  completedAt: string | null
}

@Route('fio/sync-all')
@Tags('FIO Sync')
@Security('jwt')
export class FioSyncController extends Controller {
  /**
   * Start a full FIO sync (inventory + planets + demand recalculation).
   * Returns immediately with a job ID for polling.
   */
  @Post()
  @SuccessResponse('202', 'Sync started')
  public async startSyncAll(
    @Request() request: { user: JwtPayload }
  ): Promise<SyncJobStartResponse> {
    const userId = request.user.userId

    // Check FIO credentials
    const { fioUsername, fioApiKey } = await userSettingsService.getFioCredentials(userId)
    if (!fioUsername || !fioApiKey) {
      this.setStatus(400)
      throw BadRequest(
        'FIO credentials not configured. Please set your FIO username and API key in Settings.'
      )
    }

    // Check for existing running job for this user
    for (const job of jobStore.values()) {
      if (job.userId === userId && (job.status === 'pending' || job.status === 'running')) {
        this.setStatus(202)
        return { jobId: job.id, status: 'pending' }
      }
    }

    // Clean up old jobs
    cleanupJobs()

    // Get user settings for sync options
    const excludedLocations = ((await userSettingsService.getSetting(
      userId,
      'fio.excludedLocations'
    )) ?? []) as string[]
    const excludedPlanets = ((await userSettingsService.getSetting(
      userId,
      'burnRepair.excludedPlanets'
    )) ?? []) as string[]

    // Create job
    const jobId = randomUUID()
    const job: SyncJob = {
      id: jobId,
      userId,
      status: 'running',
      result: null,
      error: null,
      startedAt: new Date(),
      completedAt: null,
    }
    jobStore.set(jobId, job)

    // Run sync in background (don't await)
    syncUserAll(userId, fioApiKey, fioUsername, {
      excludedLocations,
      excludedPlanets,
    })
      .then(result => {
        job.status = result.success ? 'completed' : 'failed'
        job.result = result
        job.completedAt = new Date()
      })
      .catch(error => {
        job.status = 'failed'
        job.error = error instanceof Error ? error.message : 'Unknown error'
        job.completedAt = new Date()
      })

    this.setStatus(202)
    return { jobId, status: 'pending' }
  }

  /**
   * Poll the status of a sync job
   */
  @Get('{jobId}')
  public async getSyncStatus(@Path() jobId: string): Promise<SyncJobStatusResponse> {
    const job = jobStore.get(jobId)

    if (!job) {
      this.setStatus(404)
      throw NotFound('Sync job not found or expired')
    }

    return {
      jobId: job.id,
      status: job.status,
      result: job.result,
      error: job.error,
      startedAt: job.startedAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    }
  }
}
