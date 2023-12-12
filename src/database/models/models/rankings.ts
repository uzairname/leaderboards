import { eq, desc, sql, inArray } from 'drizzle-orm'

import { assert } from '../../../utils/utils'

import { Rankings, GuildRankings, Players, Matches, QueueTeams } from '../../schema'

import { DatabaseErrors } from '../../utils/errors'

import { DbObject, DbObjectManager } from '../managers'
import { RankingSelect, RankingUpdate, RankingInsert } from '../types'
import { GuildRanking, Match, Player, Team } from '..'
import { DbClient } from '../../client'

export const default_players_per_team = 1
export const default_num_teams = 2

export const default_elo_settings = {
  initial_rating: 25,
  initial_rd: 25 / 3,
}

export class Ranking extends DbObject<RankingSelect> {
  constructor(data: RankingSelect, db: DbClient) {
    super(data, db)
    let update: RankingUpdate = {}
    if (!data.elo_settings) {
      update['elo_settings'] = default_elo_settings
    }
    if (!data.num_teams || data.players_per_team) {
      update['num_teams'] = default_num_teams
      update['players_per_team'] = default_players_per_team
    }
    this.data = { ...this.data, ...update }
    this.update(update).then(() => {})
  }

  async guildRankings(): Promise<GuildRanking[]> {
    const query_results = await this.db.db
      .select()
      .from(GuildRankings)
      .where(eq(GuildRankings.ranking_id, this.data.id))

    return query_results.map((data) => {
      return new GuildRanking(data, this.db)
    })
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
    assert(data.num_teams ? data.num_teams <= 4 : true, 'num_teams must be <= 4')
    assert(
      data.players_per_team ? data.players_per_team <= 25 : true,
      'players_per_team must be <= 25',
    )

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
      throw new DatabaseErrors.NotFoundError(`Ranking doesn't exist`)
    }
    return new Ranking(data, this.db)
  }
}
