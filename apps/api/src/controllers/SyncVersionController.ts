import { Controller, Get, Route, Tags } from 'tsoa'
import { syncService } from '@kawakawa/services/sync-state'

/**
 * The one deliberately-unauthenticated sync endpoint, kept in its own controller.
 *
 * It could live on `SyncController` with `@Security('jwt')` moved from the class
 * down onto each authenticated method, but that makes the class default *open*:
 * any method added later is public unless its author remembers to declare
 * otherwise, and the failure mode is a silent access-control hole. Splitting the
 * public endpoint out keeps `SyncController` closed by default and removes the
 * footgun instead of writing a test that guards against forgetting.
 */
@Route('sync')
@Tags('Sync')
export class SyncVersionController extends Controller {
  /**
   * Currently-deployed build version. **Deliberately unauthenticated.**
   *
   * A tab running an outdated bundle needs to discover it is outdated so it can
   * reload itself. `GET /sync/state` cannot serve that purpose: it requires a
   * valid session, so a tab whose token has expired 401s before it ever reads
   * `appVersion` — which is exactly the tab most in need of eviction, and is how
   * a weeks-old bundle stayed alive long enough to keep destroying good sessions.
   *
   * Exposes nothing but a commit SHA that is already baked into the public JS.
   */
  @Get('version')
  public async getVersion(): Promise<{ appVersion: string }> {
    return { appVersion: syncService.getAppVersion() }
  }
}
