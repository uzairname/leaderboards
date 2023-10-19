import { eq, desc } from 'drizzle-orm'
import { Match } from './matches'
import { Player } from './players'
import { LeaderboardDivisionSelect } from '../types'
import { Players, Matches, LeaderboardDivisions } from '../../schema'
import { DbObject } from '../managers'
import { DbObjectManager } from '../managers'
import { DatabaseErrors } from '../../utils/errors'

export class LeaderboardDivision extends DbObject<LeaderboardDivisionSelect> {
  /**
   *
   * @returns The top players in this division, ordered by highest rating to lowest
   */
  async getOrderedTopPlayers(): Promise<Player[]> {
    let players = await this.client.db
      .select()
      .from(Players)
      .where(eq(Players.lb_division_id, this.data.id))
      .orderBy(desc(Players.rating))
    return players.map((item) => {
      return new Player(item, this.client)
    })
  }

  /**
   *
   * @returns The latest n or all matches in this division, ordered by oldest to most recent
   */
  async latestMatches(n?: number): Promise<Match[]> {
    let query = this.client.db
      .select()
      .from(Matches)
      .where(eq(Matches.lb_division_id, this.data.id))
      .orderBy(desc(Matches.time_finished))
    if (n) query = query.limit(n)
    let matches = await query
    return matches.map((item) => {
      return new Match(item, this.client)
    })
  }
}

export class LeaderboardDivisionsManager extends DbObjectManager {
  async getOrFail(id: number): Promise<LeaderboardDivision> {
    let data = (
      await this.client.db
        .select()
        .from(LeaderboardDivisions)
        .where(eq(LeaderboardDivisions.id, id))
    )[0]
    if (!data) throw new DatabaseErrors.NotFoundError(`Leaderboard division ${id} not found`)
    return new LeaderboardDivision(data, this.client)
  }
}
