import { and, eq, InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { Guild, Ranking } from '.'
import { sentry } from '../../logging/sentry'
import { DbClient } from '../client'
import { DbErrors } from '../errors'
import { DbObject, DbObjectManager } from '../managers'
import { GuildRankings, Guilds, Rankings } from '../schema'

export class GuildRanking extends DbObject<GuildRankingSelect> {
  constructor(data: GuildRankingSelect, db: DbClient) {
    super(data, db)
    db.cache.guild_rankings[data.guild_id] ??= {}
    db.cache.guild_rankings[data.guild_id][data.ranking_id] = this
  }

  async update(data: Partial<Omit<GuildRankingInsert, 'guild_id' | 'ranking_id'>>): Promise<this> {
    this.data = (
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
    return this
  }

  get guild(): Promise<Guild> {
    return this.db.guilds.get(this.data.guild_id).then(guild => {
      if (!guild) throw new DbErrors.NotFoundError(`Guild ${this.data.guild_id} not found`)
      return guild
    })
  }

  get ranking(): Promise<Ranking> {
    return this.db.rankings.get(this.data.ranking_id).then(ranking => {
      if (!ranking) throw new DbErrors.NotFoundError(`Ranking ${this.data.ranking_id} not found`)
      return ranking
    })
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

    this.db.cache.guild_guild_rankings[guild.data.id] ??= []
    this.db.cache.guild_guild_rankings[guild.data.id].push({
      guild_ranking: new_guild_ranking,
      ranking,
    })
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
      const cached_guild_ranking = this.db.cache.guild_rankings[by.guild_id]?.[by.ranking_id]
      if (cached_guild_ranking) {
        sentry.debug(`Cache hit for guild_ranking guild:${by.guild_id} ranking:${by.ranking_id}`)
        return cached_guild_ranking as any
      }
      const data = await this.db.drizzle
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
      const cached_rankings = this.db.cache.guild_guild_rankings[by.guild_id]
      if (cached_rankings) {
        sentry.debug(`Cache hit for guild_rankings guild:${by.guild_id}`)
        return cached_rankings as any
      }
      const data = await this.db.drizzle
        .select({ ranking: Rankings, guild_ranking: GuildRankings })
        .from(GuildRankings)
        .where(eq(GuildRankings.guild_id, by.guild_id))
        .innerJoin(Rankings, eq(GuildRankings.ranking_id, Rankings.id))

      const result = data.map(d => ({
        guild_ranking: new GuildRanking(d.guild_ranking, this.db),
        ranking: new Ranking(d.ranking, this.db),
      })) as any
      this.db.cache.guild_guild_rankings[by.guild_id] = result
      return result
    } else if (by.ranking_id) {
      const data = await this.db.drizzle
        .select()
        .from(GuildRankings)
        .where(eq(GuildRankings.ranking_id, by.ranking_id))
        .innerJoin(Guilds, eq(GuildRankings.guild_id, Guilds.id))
      return data.map(d => ({
        guild_ranking: new GuildRanking(d.GuildRankings, this.db),
        guild: new Guild(d.Guilds, this.db),
      })) as any
    } else {
      throw new DbErrors.ArgumentError(`Must specify guild_id or ranking_id`)
    }
  }
}
export type GuildRankingSelect = InferSelectModel<typeof GuildRankings>
export type GuildRankingInsert = InferInsertModel<typeof GuildRankings>

export type GuildRankingDisplaySettings = {
  leaderboard_message?: boolean
  log_matches?: boolean
}
