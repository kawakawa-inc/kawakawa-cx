import { Controller, Get, Route, Security, Tags, Request } from 'tsoa'
import type { ContractCoverageEntry } from '@kawakawa/types'
import { getContractCoverage } from '../services/logistics-contract-coverage.js'
import type { JwtPayload } from '../utils/jwt.js'

/**
 * "Incoming" inventory deltas from the user's active buy invoices —
 * pending/confirmed/partially_fulfilled, plus fulfilled reservations that
 * FIO hasn't yet synced. The Plan tab subtracts these from contract row
 * amounts so already-ordered material doesn't show as needing a contract.
 */
@Route('logistics/contract-coverage')
@Tags('Logistics')
@Security('jwt')
export class ContractCoverageController extends Controller {
  @Get()
  public async list(@Request() request: { user: JwtPayload }): Promise<ContractCoverageEntry[]> {
    const userId = request.user.userId
    const rows = await getContractCoverage(userId)
    return rows
  }
}
