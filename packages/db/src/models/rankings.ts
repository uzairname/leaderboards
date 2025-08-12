import { eq, InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { z } from 'zod'
import { Player } from '.'
import { DbObjectManager } from '../classes'
import { DbClient } from '../client'
import { DbErrors } from '../errors'
import { Players, Rankings } from '../schema'

export type RankingSelect = InferSelectModel<typeof Rankings>
export type RankingInsert = Omit<InferInsertModel<typeof Rankings>, 'id'>
export type RankingUpdate = Partial<RankingInsert>

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
}

export type RatingSettings = {
  rating_strategy: RatingStrategy
  initial_rating: Rating
  k_factor?: number
}

export type MatchmakingSettings = {
  queue_enabled?: boolean
  default_best_of?: number
  direct_challenge_enabled?: boolean
}

export const MatchSettingsSchema = z.object({
  custom_desc: z
    .object({
      random_items_each_team_choices: z.record(z.array(z.string())).optional(),
    })
    .optional(),
})

export type MatchSettings = z.infer<typeof MatchSettingsSchema>

export class PartialRanking {
  constructor(
    public data: { id: number },
    public db: DbClient,
  ) {}

  toString() {
    return `[Ranking ${this.data.id}]`
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
    this.db.cache.user_players.delete(this.data.id)
    this.db.cache.players.clear()
    this.db.cache.teams.clear()
    this.db.cache.matches.clear()
    this.db.cache.match_players.clear()
  }
}

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

export class RankingsManager extends DbObjectManager {
  async create(data: RankingInsert): Promise<Ranking> {
    const new_data = (await this.db.drizzle.insert(Rankings).values(data).returning())[0]
    return new Ranking(new_data, this.db)
  }

  get(id: number): PartialRanking {
    return new PartialRanking({ id }, this.db)
  }

  async fetch(id: number): Promise<Ranking> {
    if (this.db.cache.rankings.has(id)) return this.db.cache.rankings.get(id)!
    const data = (await this.db.drizzle.select().from(Rankings).where(eq(Rankings.id, id)))[0]
    if (!data) throw new DbErrors.NotFound(`Ranking ${id} not found`)
    return new Ranking(data, this.db)
  }
}
