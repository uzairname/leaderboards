import { and, eq } from 'drizzle-orm'
import { GuildLeaderboardSelect, GuildLeaderboardUpdate, GuildLeaderboardInsert } from '../types'
import { DbObject } from '../managers'
import { DbObjectManager } from '../managers'
import { Guild } from './guilds'
import { Ranking } from './leaderboards'
import { GuildRankings } from '../../schema'
import { DatabaseErrors } from '../../utils/errors'

export class GuildRanking extends DbObject<GuildLeaderboardSelect> {
  async update(data: GuildLeaderboardUpdate) {
    this.data = (
      await this.db.db
        .update(GuildRankings)
        .set(data)
        .where(
          and(
            eq(GuildRankings.guild_id, this.data.guild_id),
            eq(GuildRankings.ranking_id, this.data.ranking_id),
          ),
        )
        .returning()
    )[0]
  }

  async guild(): Promise<Guild> {
    const guild = await this.db.guilds.get(this.data.guild_id)
    if (!guild) throw new DatabaseErrors.ReferenceError(`Guild ${this.data.guild_id} not found`)
    return guild
  }

  async ranking(): Promise<Ranking> {
    const ranking = await this.db.rankings.get(this.data.ranking_id)
    if (!ranking)
      throw new DatabaseErrors.ReferenceError(`Ranking ${this.data.ranking_id} not found`)
    return ranking
  }
}

export class GuildLeaderboardsManager extends DbObjectManager {
  // when creating, pass in guild and leaderboard objects instead of ids
  async create(
    guild: Guild,
    ranking: Ranking,
    data: Omit<GuildLeaderboardInsert, 'guild_id' | 'ranking_id'>,
  ): Promise<GuildRanking> {
    let new_data = (
      await this.db.db
        .insert(GuildRankings)
        .values({
          guild_id: guild.data.id,
          ranking_id: ranking.data.id,
          ...data,
        })
        .returning()
    )[0]

    return new GuildRanking(new_data, this.db)
  }

  async get(guild_id: string, leaderboard_id: number): Promise<GuildRanking | undefined> {
    let data = (
      await this.db.db
        .select()
        .from(GuildRankings)
        .where(
          and(eq(GuildRankings.guild_id, guild_id), eq(GuildRankings.ranking_id, leaderboard_id)),
        )
    )[0]
    if (!data) return
    return new GuildRanking(data, this.db)
  }
}
