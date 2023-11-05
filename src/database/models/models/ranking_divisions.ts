import { eq, desc, sql } from 'drizzle-orm'
import { Match } from './matches'
import { Player } from './players'
import { LeaderboardDivisionSelect } from '../types'
import {
  Players,
  Matches,
  RankingDivisions,
} from '../../schema'
import { DbObject } from '../managers'
import { DbObjectManager } from '../managers'
import { DatabaseErrors } from '../../utils/errors'
import { User } from './users'

export class RankingDivision extends DbObject<LeaderboardDivisionSelect> {
  /**
   *
   * @returns The top players in this division, ordered by highest rating to lowest
   */
  async getOrderedTopPlayers(): Promise<Player[]> {
    let players = await this.db.conn
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
    let query = this.db.conn
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

  /**
   * Returns a list of list of users, where each list of users is a team in the queue.
   * @param contains_users
   * @returns
   */
  // async queueTeams(contains_user?: User): Promise<Array<Array<User>>> {
  //   let query = this.db.conn
  //     .select()
  //     .from(QueueTeams)
  //     .where(eq(QueueTeams.ranking_division_id, this.data.id))

  //   if (contains_user) {
  //     var result = this.db.conn.execute(sql`
  //       SELECT qt.id
  //       FROM queue_teams qt
  //       JOIN queue_team_players qtp ON qtp.queue_team_id = qt.id
  //       WHERE qt.ranking_division_id = ${this.data.id}
  //       AND qtp.user_id = ${contains_user.data.id}`)
  //   }

  //   let teams = await query
  // }
}

export class RankingDivisionsManager extends DbObjectManager {
  async getOrFail(id?: number | null): Promise<RankingDivision> {
    let data = id
      ? (await this.db.conn.select().from(RankingDivisions).where(eq(RankingDivisions.id, id)))[0]
      : undefined
    if (!data) throw new DatabaseErrors.NotFoundError(`Leaderboard division ${id} not found`)
    return new RankingDivision(data, this.db)
  }
}
