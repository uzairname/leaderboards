import { eq, inArray } from 'drizzle-orm'

import {
  LeaderboardSelect,
  LeaderboardUpdate,
  LeaderboardDivisionInsert,
  LeaderboardInsert,
} from '../types'
import { GuildRanking } from './guild_leaderboards'
import { RankingDivision } from './leaderboard_divisions'
import { Rankings, RankingDivisions, GuildRankings } from '../../schema'
import { DbObject } from '../managers'
import { DbObjectManager } from '../managers'
import { sentry } from '../../../utils/globals'

export class Ranking extends DbObject<LeaderboardSelect> {
  async update(data: LeaderboardUpdate) {
    let newdata = (
      await this.db.conn.update(Rankings).set(data).where(eq(Rankings.id, this.data.id)).returning()
    )[0]
    this.data = newdata
  }

  async delete() {
    await this.db.conn.delete(Rankings).where(eq(Rankings.id, this.data.id))
  }

  async guildLeaderboards(): Promise<GuildRanking[]> {
    const query_results = await this.db.conn
      .select()
      .from(GuildRankings)
      .where(eq(GuildRankings.ranking_id, this.data.id))

    return query_results.map((data) => {
      return new GuildRanking(data, this.db)
    })
  }

  async createDivision(
    data: Omit<LeaderboardDivisionInsert, 'ranking_id'>,
    set_current?: boolean,
  ): Promise<RankingDivision> {
    let new_division_data = (
      await this.db.conn
        .insert(RankingDivisions)
        .values({ ranking_id: this.data.id, ...data })
        .returning()
    )[0]
    if (set_current) {
      await this.update({
        current_division_id: new_division_data.id,
      })
    }

    return new RankingDivision(new_division_data, this.db)
  }

  async divisions(): Promise<RankingDivision[]> {
    const query_results = await this.db.conn
      .select()
      .from(RankingDivisions)
      .where(eq(RankingDivisions.ranking_id, this.data.id))

    return query_results.map((data) => {
      return new RankingDivision(data, this.db)
    })
  }
}

export class RankingsManager extends DbObjectManager {
  async create(data: LeaderboardInsert): Promise<Ranking> {
    let new_leaderboard_data = (
      await this.db.conn
        .insert(Rankings)
        .values({ ...data })
        .returning()
    )[0]
    return new Ranking(new_leaderboard_data, this.db)
  }

  async get(id: number): Promise<Ranking | undefined> {
    let data = (await this.db.conn.select().from(Rankings).where(eq(Rankings.id, id)))[0]
    if (!data) return
    return new Ranking(data, this.db)
  }
}
