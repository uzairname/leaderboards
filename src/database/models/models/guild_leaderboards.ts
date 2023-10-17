import { and, eq } from 'drizzle-orm'
import { GuildLeaderboardSelect, GuildLeaderboardUpdate, GuildLeaderboardInsert } from '../types'
import { DbObject } from '../../objectmanager'
import { DbObjectManager } from '../../objectmanager'
import { Guild } from './guilds'
import { Leaderboard } from './leaderboards'
import { GuildLeaderboards } from '../../schema'
import { DatabaseErrors } from '../../errors'

export class GuildLeaderboard extends DbObject<GuildLeaderboardSelect> {
  async update(data: GuildLeaderboardUpdate) {
    this.data = (
      await this.client.db
        .update(GuildLeaderboards)
        .set(data)
        .where(
          and(
            eq(GuildLeaderboards.guild_id, this.data.guild_id),
            eq(GuildLeaderboards.leaderboard_id, this.data.leaderboard_id),
          ),
        )
        .returning()
    )[0]
  }

  async guild(): Promise<Guild> {
    const guild = await this.client.guilds.get(this.data.guild_id)
    if (!guild) throw new DatabaseErrors.ReferenceError(`Guild ${this.data.guild_id} not found`)
    return guild
  }

  async leaderboard(): Promise<Leaderboard> {
    const leaderboard = await this.client.leaderboards.get(this.data.leaderboard_id)
    if (!leaderboard)
      throw new DatabaseErrors.ReferenceError(`Leaderboard ${this.data.leaderboard_id} not found`)
    return leaderboard
  }
}

export class GuildLeaderboardsManager extends DbObjectManager {
  // when creating, pass in guild and leaderboard objects instead of ids
  async create(
    guild: Guild,
    leaderboard: Leaderboard,
    data: Omit<GuildLeaderboardInsert, 'guild_id' | 'leaderboard_id'>,
  ): Promise<GuildLeaderboard> {
    let new_data = (
      await this.client.db
        .insert(GuildLeaderboards)
        .values({
          guild_id: guild.data.id,
          leaderboard_id: leaderboard.data.id,
          ...data,
        })
        .returning()
    )[0]

    return new GuildLeaderboard(new_data, this.client)
  }

  async get(guild_id: string, leaderboard_id: number): Promise<GuildLeaderboard | undefined> {
    let data = (
      await this.client.db
        .select()
        .from(GuildLeaderboards)
        .where(
          and(
            eq(GuildLeaderboards.guild_id, guild_id),
            eq(GuildLeaderboards.leaderboard_id, leaderboard_id),
          ),
        )
    )[0]
    if (!data) return
    return new GuildLeaderboard(data, this.client)
  }
}
