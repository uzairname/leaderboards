import { and, eq, InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { Guild, Ranking } from '.'
import { DbClient } from '../client'
import { DbErrors } from '../errors'
import { DbObjectManager } from '../managers'
import { GuildRankings, Guilds, Rankings } from '../schema'
import { PartialGuild } from './guilds'
import { PartialRanking } from './rankings'

export class PartialGuildRanking {

  constructor(
    public data: { guild_id: string; ranking_id: number },
    public db: DbClient
  ) {
  }

  toString() {
    return `[GuildRanking ${this.data.guild_id}, ${this.data.ranking_id}]`
  }

  async fetch(): Promise<{ guild: Guild; guild_ranking: GuildRanking; ranking: Ranking }> {
    return this.db.guild_rankings.fetch(this.data)
  }

  get guild(): PartialGuild {
    return this.db.guilds.get(this.data.guild_id)
  }

  get ranking(): PartialRanking {
    return this.db.rankings.get(this.data.ranking_id)
  }

  async update(
    data: Partial<Omit<GuildRankingInsert, 'guild_id' | 'ranking_id'>>,
  ): Promise<GuildRanking> {
    const new_data = (
      await this.db.drizzle
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
    this.data = new_data
    return new GuildRanking(new_data, this.db)
  }
}

export class GuildRanking extends PartialGuildRanking {
  constructor(
    public data: GuildRankingSelect,
    public db: DbClient,
  ) {
    super(data, db)
    this.db.cache.guild_rankings.set(this.data.guild_id, this, this.data.ranking_id)
    this.db.cache.guild_rankings_by_guild.delete(this.data.guild_id)
  }
}

export class GuildRankingsManager extends DbObjectManager {

  // when creating, pass in guild and ranking objects instead of ids
  async create(
    guild: Guild,
    ranking: Ranking,
    data: Omit<GuildRankingInsert, 'guild_id' | 'ranking_id'>,
  ): Promise<GuildRanking> {
    const new_data = (
      await this.db.drizzle
        .insert(GuildRankings)
        .values({
          guild_id: guild.data.id,
          ranking_id: ranking.data.id,
          ...data,
        })
        .returning()
    )[0]
    const new_guild_ranking = new GuildRanking(new_data, this.db)
    return new_guild_ranking
  }

  async getByName(guild_id: string, name: string) {
    const data = (
      await this.db.drizzle
        .select()
        .from(GuildRankings)
        .innerJoin(Rankings, eq(GuildRankings.ranking_id, Rankings.id))
        .where(and(eq(GuildRankings.guild_id, guild_id), eq(Rankings.name, name)))
    )[0]
    if (!data) return null
    return new GuildRanking(data.GuildRankings, this.db)
  }

  get(guild_id: string, ranking_id: number): PartialGuildRanking {
    return new PartialGuildRanking({ guild_id, ranking_id }, this.db)
  }

  async fetch<By extends { guild_id?: string; ranking_id?: number }>(
    by: By,
  ): Promise<
    By extends { guild_id: string }
      ? By extends { ranking_id: number }
        ? { guild: Guild; guild_ranking: GuildRanking; ranking: Ranking }
        : { ranking: Ranking; guild_ranking: GuildRanking }[]
      : By extends { ranking_id: number }
        ? { guild: Guild; guild_ranking: GuildRanking }[]
        : never
  > {
    if (by.guild_id && by.ranking_id) {
      if (
        this.db.cache.guild_rankings.has(by.guild_id, by.ranking_id) &&
        this.db.cache.guilds.has(by.guild_id) &&
        this.db.cache.rankings.has(by.ranking_id)
      ) {
        return {
          guild: this.db.cache.guilds.get(by.guild_id)!,
          guild_ranking: this.db.cache.guild_rankings.get(by.guild_id, by.ranking_id)!,
          ranking: this.db.cache.rankings.get(by.ranking_id)!,
        } as any
      }

      const data = (
        await this.db.drizzle
          .select()
          .from(GuildRankings)
          .where(
            and(
              eq(GuildRankings.guild_id, by.guild_id),
              eq(GuildRankings.ranking_id, by.ranking_id),
            ),
          )
          .innerJoin(Rankings, eq(Rankings.id, GuildRankings.ranking_id))
          .innerJoin(Guilds, eq(Guilds.id, GuildRankings.guild_id))
      )[0]

      if (!data)
        throw new DbErrors.NotFound(`GuildRanking ${by.guild_id} ${by.ranking_id} doesn't exist`)

      const result: { guild: Guild; guild_ranking: GuildRanking; ranking: Ranking } = {
        guild: new Guild(data.Guilds, this.db),
        guild_ranking: new GuildRanking(data.GuildRankings, this.db),
        ranking: new Ranking(data.Rankings, this.db),
      }
      return result as any
    } else if (by.guild_id) {
      if (this.db.cache.guild_rankings_by_guild.has(by.guild_id)) {
        return this.db.cache.guild_rankings_by_guild.get(by.guild_id)! as any
      }

      const data = await this.db.drizzle
        .select()
        .from(GuildRankings)
        .where(eq(GuildRankings.guild_id, by.guild_id))
        .innerJoin(Rankings, eq(GuildRankings.ranking_id, Rankings.id))

      const result: { guild_ranking: GuildRanking; ranking: Ranking }[] = data.map(d => ({
        guild_ranking: new GuildRanking(d.GuildRankings, this.db),
        ranking: new Ranking(d.Rankings, this.db),
      }))

      this.db.cache.guild_rankings_by_guild.set(by.guild_id, result)
      return result as any
    } else if (by.ranking_id) {
      if (this.db.cache.guild_rankings_by_ranking.has(by.ranking_id)) {
        return this.db.cache.guild_rankings_by_ranking.get(by.ranking_id)! as any
      }

      const data = await this.db.drizzle
        .select()
        .from(GuildRankings)
        .where(eq(GuildRankings.ranking_id, by.ranking_id))
        .innerJoin(Guilds, eq(GuildRankings.guild_id, Guilds.id))

      const result: { guild: Guild; guild_ranking: GuildRanking }[] = data.map(d => ({
        guild: new Guild(d.Guilds, this.db),
        guild_ranking: new GuildRanking(d.GuildRankings, this.db),
      }))
      this.db.cache.guild_rankings_by_ranking.set(by.ranking_id, result)
      return result as any
    } else {
      throw new DbErrors.ValueError(`Must specify guild_id or ranking_id`)
    }
  }
}
export type GuildRankingSelect = InferSelectModel<typeof GuildRankings>
export type GuildRankingInsert = InferInsertModel<typeof GuildRankings>

export type GuildRankingDisplaySettings = {
  leaderboard_message?: boolean
  log_matches?: boolean
}
