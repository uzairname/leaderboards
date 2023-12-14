import { eq, desc } from 'drizzle-orm'

import { assert } from '../../../utils/utils'

import { Rankings, Players, Matches } from '../../schema'

import { DbErrors } from '../../utils/errors'

import { DbObject, DbObjectManager } from '../managers'
import { RankingSelect, RankingUpdate, RankingInsert } from '../types'
import { GuildRanking, Match, Player } from '..'
import { DbClient } from '../../client'

export const default_players_per_team = 1
export const default_num_teams = 2

export const default_elo_settings = {
  initial_rating: 25,
  initial_rd: 25 / 3,
}

export class Ranking extends DbObject<RankingSelect> {
  public partial: boolean

  constructor(data: RankingSelect, db: DbClient, partial?: boolean) {
    !data.elo_settings && (data.elo_settings = default_elo_settings)
    !data.num_teams && (data.num_teams = default_num_teams)
    !data.players_per_team && (data.players_per_team = default_players_per_team)
    super(data, db)
    this.partial = partial ?? false
  }

  /**
   *
   * @returns The top players in this ranking, ordered by highest rating to lowest
   */
  async getOrderedTopPlayers(): Promise<Player[]> {
    let players = await this.db.db
      .select()
      .from(Players)
      .where(eq(Players.ranking_id, this.data.id))
      .orderBy(desc(Players.rating))
    return players.map((item) => {
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
    let matches = await query
    return matches.map((item) => {
      return new Match(item, this.db)
    })
  }

  async update(data: RankingUpdate) {
    let newdata = (
      await this.db.db.update(Rankings).set(data).where(eq(Rankings.id, this.data.id)).returning()
    )[0]
    this.data = newdata
  }

  async delete() {
    await this.db.db.delete(Rankings).where(eq(Rankings.id, this.data.id))
  }
}

export class RankingsManager extends DbObjectManager {
  async create(data: RankingInsert): Promise<Ranking> {
    let new_ranking_data = (
      await this.db.db
        .insert(Rankings)
        .values({ ...data })
        .returning()
    )[0]
    return new Ranking(new_ranking_data, this.db)
  }

  async get(ranking_id: number): Promise<Ranking> {
    let data = (await this.db.db.select().from(Rankings).where(eq(Rankings.id, ranking_id)))[0]
    if (!data) {
      throw new DbErrors.NotFoundError(`Ranking doesn't exist`)
    }
    return new Ranking(data, this.db)
  }
}
