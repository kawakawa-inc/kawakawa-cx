import { Controller, Get, Post, Path, Route, Security, Tags, Request, SuccessResponse } from 'tsoa'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import { db, syncJobs } from '../db/index.js'
import { eq } from 'drizzle-orm'
import * as userSettingsService from '@kawakawa/services/user-settings'
import { enqueueUserFullSync } from '@kawakawa/services/sync-queue'

interface SyncJobStartResponse {
  jobIds: { inventory: number; planets: number }
}

interface SyncJobStatusResponse {
  jobId: number
  jobType: string
  status: 'pending' | 'running' | 'done' | 'failed'
  attempts: number
  startedAt: string | null
  finishedAt: string | null
  error: string | null
}

@Route('fio/sync-all')
@Tags('FIO Sync')
@Security('jwt')
export class FioSyncController extends Controller {
  /**
   * Enqueue a full FIO sync for the current user (inventory + planet list).
   * Dedup is applied server-side — repeated calls return the same job IDs
   * until the current sync finishes.
   */
  @Post()
  @SuccessResponse('202', 'Sync enqueued')
  public async startSyncAll(
    @Request() request: { user: JwtPayload }
  ): Promise<SyncJobStartResponse> {
    const userId = request.user.userId

    const { fioUsername, fioApiKey } = await userSettingsService.getFioCredentials(userId)
    if (!fioUsername || !fioApiKey) {
      this.setStatus(400)
      throw BadRequest(
        'FIO credentials not configured. Please set your FIO username and API key in Settings.'
      )
    }

    const { inventoryJobId, planetsJobId } = await enqueueUserFullSync(userId, {
      source: 'user',
      notify: true,
    })

    this.setStatus(202)
    return { jobIds: { inventory: inventoryJobId, planets: planetsJobId } }
  }

  /**
   * Poll the status of a sync job.
   */
  @Get('{jobId}')
  public async getSyncStatus(@Path() jobId: number): Promise<SyncJobStatusResponse> {
    const [job] = await db.select().from(syncJobs).where(eq(syncJobs.id, jobId))
    if (!job) {
      this.setStatus(404)
      throw NotFound('Sync job not found')
    }

    return {
      jobId: job.id,
      jobType: job.jobType,
      status: job.status,
      attempts: job.attempts,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      error: job.error,
    }
  }
}
