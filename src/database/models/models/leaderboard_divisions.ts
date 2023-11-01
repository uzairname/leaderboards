import { eq, desc } from 'drizzle-orm'
import { Match } from './matches'
import { Player } from './players'
import { LeaderboardDivisionSelect } from '../types'
import { Players, Matches, RankingDivisions } from '../../schema'
import { DbObject } from '../managers'
import { DbObjectManager } from '../managers'
import { DatabaseErrors } from '../../utils/errors'

export class RankingDivision extends DbObject<LeaderboardDivisionSelect> {
  /**
   *
   * @returns The top players in this division, ordered by highest rating to lowest
   */
  async getOrderedTopPlayers(): Promise<Player[]> {
    let players = await this.db.db
      .select()
      .from(Players)
      .where(eq(Players.ranking_division_id, this.data.id))
      .orderBy(desc(Players.rating))
    return players.map((item) => {
      return new Player(item, this.db)
    })
  }

  /**
   *
   * @returns The latest n or all matches in this division, ordered by oldest to most recent
   */
  async latestMatches(n?: number): Promise<Match[]> {
    let query = this.db.db
      .select()
      .from(Matches)
      .where(eq(Matches.ranking_division_id, this.data.id))
      .orderBy(desc(Matches.time_finished))
    if (n) query = query.limit(n)
    let matches = await query
    return matches.map((item) => {
      return new Match(item, this.db)
    })
  }
}

export class RankingDivisionsManager extends DbObjectManager {
  async getOrFail(id?: number | null): Promise<RankingDivision> {
    let data = id
      ? (await this.db.db.select().from(RankingDivisions).where(eq(RankingDivisions.id, id)))[0]
      : undefined
    if (!data) throw new DatabaseErrors.NotFoundError(`Leaderboard division ${id} not found`)
    return new RankingDivision(data, this.db)
  }
}
