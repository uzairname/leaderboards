import { eq, inArray } from 'drizzle-orm'

import {
  LeaderboardSelect,
  LeaderboardUpdate,
  LeaderboardDivisionInsert,
  LeaderboardInsert,
} from '../types'
import { GuildLeaderboard } from './guild_leaderboards'
import { LeaderboardDivision } from './leaderboard_divisions'
import {
  Leaderboards,
  Players,
  Matches,
  QueueTeams,
  LeaderboardDivisions,
  GuildLeaderboards,
} from '../../schema'
import { DbObject } from '../managers'
import { DbObjectManager } from '../managers'
import { sentry } from '../../../utils/globals'

export class Leaderboard extends DbObject<LeaderboardSelect> {
  async update(data: LeaderboardUpdate) {
    let newdata = (
      await this.client.db
        .update(Leaderboards)
        .set(data)
        .where(eq(Leaderboards.id, this.data.id))
        .returning()
    )[0]
    this.data = newdata
  }

  async delete() {
    await this.client.db.delete(Leaderboards).where(eq(Leaderboards.id, this.data.id))
  }

  async guildLeaderboards(): Promise<GuildLeaderboard[]> {
    const query_results = await this.client.db
      .select()
      .from(GuildLeaderboards)
      .where(eq(GuildLeaderboards.leaderboard_id, this.data.id))

    return query_results.map((data) => {
      return new GuildLeaderboard(data, this.client)
    })
  }

  async createDivision(
    data: Omit<LeaderboardDivisionInsert, 'leaderboard_id'>,
    make_default?: boolean,
  ): Promise<LeaderboardDivision> {
    let new_division_data = (
      await this.client.db
        .insert(LeaderboardDivisions)
        .values({ leaderboard_id: this.data.id, ...data })
        .returning()
    )[0]
    if (make_default) {
      await this.update({
        default_division_id: new_division_data.id,
      })
    }

    return new LeaderboardDivision(new_division_data, this.client)
  }

  async divisions(): Promise<LeaderboardDivision[]> {
    const query_results = await this.client.db
      .select()
      .from(LeaderboardDivisions)
      .where(eq(LeaderboardDivisions.leaderboard_id, this.data.id))

    return query_results.map((data) => {
      return new LeaderboardDivision(data, this.client)
    })
  }
}
export class LeaderboardsManager extends DbObjectManager {
  async create(data: LeaderboardInsert): Promise<Leaderboard> {
    let new_leaderboard_data = (
      await this.client.db
        .insert(Leaderboards)
        .values({ ...data })
        .returning()
    )[0]
    return new Leaderboard(new_leaderboard_data, this.client)
  }

  async get(leaderboard_id: number): Promise<Leaderboard | undefined> {
    let data = (
      await this.client.db.select().from(Leaderboards).where(eq(Leaderboards.id, leaderboard_id))
    )[0]
    if (!data) return
    return new Leaderboard(data, this.client)
  }
}
