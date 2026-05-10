import { Controller, Post, Route, Security, Tags, Request, SuccessResponse } from 'tsoa'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest } from '../utils/errors.js'
import * as userSettingsService from '@kawakawa/services/user-settings'
import { enqueueUserFullSync } from '@kawakawa/services/sync-queue'

interface SyncJobStartResponse {
  jobIds: { inventory: number; planets: number }
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
}
