import { eq, InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { z } from 'zod'
import { OutcomeType, Player } from '.'
import { DbObject, DbObjectManager } from '../classes'
import { DbClient } from '../client'
import { DbErrors } from '../errors'
import { logDbMethods } from '../logging'
import { Players, Rankings } from '../schema'

export type RankingSelect = InferSelectModel<typeof Rankings>
export type RankingInsert = Omit<InferInsertModel<typeof Rankings>, 'id'>
export type RankingUpdate = Partial<RankingInsert>

/**
 * Represents a player's rating
 */
export type Rating = {
  mu: number
  rd?: number
  vol?: number
}

export enum RatingStrategy {
  TrueSkill = 0,
  WinsMinusLosses = 1,
  Elo = 2,
  Glicko = 3,
  Bayesian = 4,
}

export type RatingParameters = {
  rating_strategy: RatingStrategy
  initial_rating: {
    mu: number
    rd: number
    vol: number
  }
  k_factor: number
  tau: number
  provisional_rd_threshold: number
}

export type MatchmakingSettings = {
  queue_enabled?: boolean
  queue_join_ping_role_id?: string | null
  queue_join_timeout_minutes?: number
  direct_challenge_enabled?: boolean
  default_best_of?: number
}

export const MatchSettingsSchema = z.object({
  outcome_type: z.enum(OutcomeType).optional(),
  draws_allowed: z.boolean().optional(),
})

export type MatchSettings = z.infer<typeof MatchSettingsSchema>

// Governs how the ranking can be shared across guilds
export const SharigSettingsSchema = z.object({
  // If true, the ranking leaderboard can be searched for and viewed by anyone
  discoverable: z.boolean().optional(),
})

export type SharingSettings = z.infer<typeof SharigSettingsSchema>

@logDbMethods
export class PartialRanking extends DbObject<{ id: number }> {
  toString() {
    return `[PartialRanking ${this.data.id}]`
  }

  async fetch(): Promise<Ranking> {
    return this.db.rankings.fetch(this.data.id)
  }

  async players(): Promise<Player[]> {
    const data = await this.db.drizzle.select().from(Players).where(eq(Players.ranking_id, this.data.id))
    return data.map(player => new Player(player, this.db))
  }

  async queueTeams(): Promise<{ id: number; rating?: number; players: Player[] }[]> {
    throw new Error('Not implemented')
  }

  async popTeamsFromQueue(
    teams_per_match: number,
  ): Promise<{ id: number; rating?: number; players: Player[] }[] | null> {
    throw new Error('Not implemented')
  }

  async addTeamsToQueue(teams_ids: number[]) {
    throw new Error('Not implemented')
  }

  async update(data: RankingUpdate): Promise<Ranking> {
    const new_data = (
      await this.db.drizzle.update(Rankings).set(data).where(eq(Rankings.id, this.data.id)).returning()
    )[0]
    this.data = new_data
    return new Ranking(new_data, this.db)
  }

  async delete() {
    await this.db.drizzle.delete(Rankings).where(eq(Rankings.id, this.data.id))
    this.db.cache.rankings.delete(this.data.id)
    this.db.cache.guild_rankings.clear()
    this.db.cache.players_by_ranking_user.delete(this.data.id)
    this.db.cache.players.clear()
    this.db.cache.teams.clear()
    this.db.cache.matches.clear()
    this.db.cache.match_players.clear()
  }
}

@logDbMethods
export class Ranking extends PartialRanking {
  constructor(
    public data: RankingSelect,
    public db: DbClient,
  ) {
    super({ id: data.id }, db)
    this.db.cache.rankings.set(data.id, this)
  }

  toString() {
    return `[Ranking ${this.data.id}: ${this.data.name}]`
  }
}

@logDbMethods
export class RankingsManager extends DbObjectManager {
  toString() {
    return `[RankingsManager]`
  }

  async create(data: RankingInsert): Promise<Ranking> {
    const new_data = (await this.db.drizzle.insert(Rankings).values(data).returning())[0]
    return new Ranking(new_data, this.db)
  }

  get(id: number): PartialRanking {
    return new PartialRanking({ id }, this.db)
  }

  async fetch(id: number): Promise<Ranking> {
    const cached = this.db.cache.rankings.get(id)
    if (cached) return cached
    const data = (await this.db.drizzle.select().from(Rankings).where(eq(Rankings.id, id)))[0]
    if (!data) throw new DbErrors.NotFound(`Ranking ${id} not found`)
    return new Ranking(data, this.db)
  }
}
