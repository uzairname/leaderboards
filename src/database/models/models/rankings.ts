import { desc, eq } from 'drizzle-orm'
import { Match, Player } from '..'
import { DbClient } from '../../client'
import { DbErrors } from '../../errors'
import { DbObject, DbObjectManager } from '../../managers'
import { Matches, Players, Rankings } from '../../schema'
import { RankingInsert, RankingSelect } from '../../types'

export const default_players_per_team = 1
export const default_num_teams = 2

export const default_elo_settings = {
  initial_rating: 50,
  initial_rd: 50 / 3
}
// displayed_rating = rating - 0.6 * rd

export class Ranking extends DbObject<RankingSelect> {
  constructor(data: RankingSelect, db: DbClient) {
    !data.elo_settings && (data.elo_settings = default_elo_settings)
    !data.num_teams && (data.num_teams = default_num_teams)
    !data.players_per_team && (data.players_per_team = default_players_per_team)
    super(data, db)
    db.cache.rankings[data.id] = this
  }

  /**
   *
   * @returns The top players in this ranking, ordered by highest rating to lowest
   */
  async getOrderedTopPlayers(): Promise<Player[]> {
    const players = await this.db.db
      .select()
      .from(Players)
      .where(eq(Players.ranking_id, this.data.id))
      .orderBy(desc(Players.rating))
    return players.map(item => {
      return new Player(item, this.db)
    })
  }

  /**
   *
   * @returns The latest n or all matches in this ranking, ordered by oldest to most recent
   */
  async latestMatches(n?: number): Promise<Match[]> {
    let query = this.db.db
      .select()
      .from(Matches)
      .where(eq(Matches.ranking_id, this.data.id))
      .orderBy(desc(Matches.time_finished))
    if (n) query = query.limit(n)
    const matches = await query
    return matches.map(item => {
      return new Match(item, this.db)
    })
  }

  async update(data: RankingInsert): Promise<this> {
    this.data = (
      await this.db.db.update(Rankings).set(data).where(eq(Rankings.id, this.data.id)).returning()
    )[0]
    return this
  }

  async delete() {
    await this.db.db.delete(Rankings).where(eq(Rankings.id, this.data.id))
    delete this.db.cache.rankings[this.data.id]
  }
}

export class RankingsManager extends DbObjectManager {
  async create(data: RankingInsert): Promise<Ranking> {
    const new_data = (await this.db.db.insert(Rankings).values(data).returning())[0]
    return new Ranking(new_data, this.db)
  }

  async get(ranking_id: number): Promise<Ranking> {
    const cached_ranking = this.db.cache.rankings[ranking_id]
    if (cached_ranking) return cached_ranking

    const data = (await this.db.db.select().from(Rankings).where(eq(Rankings.id, ranking_id)))[0]
    if (!data) {
      throw new DbErrors.NotFoundError(`Ranking doesn't exist`)
    }
    return new Ranking(data, this.db)
  }
}
