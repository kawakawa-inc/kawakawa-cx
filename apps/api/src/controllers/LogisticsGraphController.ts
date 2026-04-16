import { Controller, Get, Route, Security, Tags, Request } from 'tsoa'
import type { LogisticsGraph } from '@kawakawa/types'
import { buildAndSolveGraph } from '../services/logistics-graph-loader.js'
import type { JwtPayload } from '../utils/jwt.js'

@Route('logistics')
@Tags('Logistics')
@Security('jwt')
export class LogisticsGraphController extends Controller {
  /**
   * Get the full logistics graph for the current user, with solver state applied.
   * Returns nodes (with balances, derived flows, shopping lists) and edges
   * (with solver-committed amounts).
   */
  @Get('graph')
  public async getGraph(@Request() request: { user: JwtPayload }): Promise<LogisticsGraph> {
    return buildAndSolveGraph(request.user.userId)
  }
}
