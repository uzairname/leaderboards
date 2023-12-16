import { and, eq } from 'drizzle-orm'

import { GuildRankings, Guilds, Rankings } from '../../schema'

import { DbErrors } from '../../errors'

import { DbObject, DbObjectManager } from '../managers'
import { GuildRankingSelect, GuildRankingUpdate, GuildRankingInsert } from '../../types'
import { Guild, Ranking } from '..'

export class GuildRanking extends DbObject<GuildRankingSelect> {
  async update(data: GuildRankingUpdate) {
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
    if (!guild) throw new DbErrors.NotFoundError(`Guild ${this.data.guild_id} not found`)
    return guild
  }

  async ranking(): Promise<Ranking> {
    const ranking = await this.db.rankings.get(this.data.ranking_id)
    if (!ranking) throw new DbErrors.NotFoundError(`Ranking ${this.data.ranking_id} not found`)
    return ranking
  }
}

export class GuildRankingsManager extends DbObjectManager {
  // when creating, pass in guild and ranking objects instead of ids
  async create(
    guild: Guild,
    ranking: Ranking,
    data: Omit<GuildRankingInsert, 'guild_id' | 'ranking_id'>,
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

  async get<By extends { guild_id?: string; ranking_id?: number }>(
    by: By,
  ): Promise<
    By extends { guild_id: string }
      ? By extends { ranking_id: number }
        ? GuildRanking
        : { ranking: Ranking; guild_ranking: GuildRanking }[]
      : By extends { ranking_id: number }
      ? { guild: Guild; guild_ranking: GuildRanking }[]
      : never
  > {
    if (by.guild_id && by.ranking_id) {
      let data = await this.db.db
        .select()
        .from(GuildRankings)
        .where(
          and(eq(GuildRankings.guild_id, by.guild_id), eq(GuildRankings.ranking_id, by.ranking_id)),
        )
      if (data.length == 0)
        throw new DbErrors.NotFoundError(
          `GuildRanking ${by.guild_id} ${by.ranking_id} doesn't exist`,
        )
      return new GuildRanking(data[0], this.db) as any
    } else if (by.guild_id) {
      let data = await this.db.db
        .select()
        .from(GuildRankings)
        .innerJoin(
          Rankings,
          and(eq(GuildRankings.ranking_id, Rankings.id), eq(GuildRankings.guild_id, by.guild_id)),
        )
      return data.map((d) => ({
        guild_ranking: new GuildRanking(d.GuildRankings, this.db),
        ranking: new Ranking(d.Rankings, this.db),
      })) as any
    } else if (by.ranking_id) {
      let data = await this.db.db
        .select()
        .from(GuildRankings)
        .innerJoin(
          Guilds,
          and(eq(GuildRankings.guild_id, Guilds.id), eq(GuildRankings.ranking_id, by.ranking_id)),
        )
      return data.map((d) => ({
        guild_ranking: new GuildRanking(d.GuildRankings, this.db),
        guild: new Guild(d.Guilds, this.db),
      })) as any
    } else {
      throw new DbErrors.ArgumentError(`Must specify guild_id or ranking_id`)
    }
  }
}
