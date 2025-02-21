import { eq, inArray, InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { z } from 'zod'
import { Player } from '.'
import { DbObjectManager } from '../classes'
import { DbClient } from '../client'
import { DbErrors } from '../errors'
import { Players, QueueTeams, Rankings, TeamPlayers, Teams } from '../schema'

export type RankingSelect = InferSelectModel<typeof Rankings>
export type RankingInsert = Omit<InferInsertModel<typeof Rankings>, 'id'>
export type RankingUpdate = Partial<RankingInsert>

export type Rating = {
  mu: number
  rd: number
  vol?: number
}

export enum ScoringMethod {
  TrueSkill = 0,
  WinsMinusLosses = 1
}

export type RatingSettings = {
  scoring_method: ScoringMethod
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

  async queueTeams(): Promise<{ id: number; rating?: number; players: Player[] }[]> {
    const data = await this.db.drizzle
      .select({ player: Players, team: Teams })
      .from(QueueTeams)
      .innerJoin(Teams, eq(QueueTeams.team_id, Teams.id))
      .innerJoin(TeamPlayers, eq(TeamPlayers.team_id, QueueTeams.team_id))
      .innerJoin(Players, eq(TeamPlayers.player_id, Players.id))
      .where(eq(Teams.ranking_id, this.data.id))

    // Group by team
    const teams: { [key: number]: { id: number; rating?: number; players: Player[] } } = {}
    for (const item of data) {
      if (!teams[item.team.id]) {
        teams[item.team.id] = {
          id: item.team.id,
          rating: item.team.rating ?? undefined,
          players: [],
        }
      }
      teams[item.team.id].players.push(new Player(item.player, this.db))
    }

    return Object.values(teams)
  }

  async popTeamsFromQueue(
    teams_per_match: number,
  ): Promise<{ id: number; rating?: number; players: Player[] }[] | null> {
    this.db.debug(`popTeamsFromQueue: ${teams_per_match} teams from ${this}`)
    // check if there are enough teams in the queue

    // Choose n_teams queue teams to delete
    const team_ids_to_delete = await this.db.drizzle
      .select({ id: QueueTeams.team_id })
      .from(QueueTeams)
      .innerJoin(Teams, eq(QueueTeams.team_id, Teams.id))
      .where(eq(Teams.ranking_id, this.data.id))
      .limit(teams_per_match)

    this.db.debug(`found ${team_ids_to_delete.length} teams: ${team_ids_to_delete.map(t => t.id)}`)

    if (team_ids_to_delete.length < teams_per_match) return null

    const result = await this.db.drizzle
      .delete(QueueTeams)
      .where(
        inArray(
          QueueTeams.team_id,
          team_ids_to_delete.map(t => t.id),
        ),
      )
      .returning()

    // select the resulting teams
    const team_ids = result.map(item => item.team_id)
    const data = await this.db.drizzle
      .select({ player: Players, team: Teams })
      .from(TeamPlayers)
      .innerJoin(Teams, eq(Teams.id, TeamPlayers.team_id))
      .innerJoin(Players, eq(Players.id, TeamPlayers.player_id))
      .where(inArray(TeamPlayers.team_id, team_ids))

    // Group by team
    const teams: { [key: number]: { id: number; rating?: number; players: Player[] } } = {}
    for (const item of data) {
      if (!teams[item.team.id]) {
        teams[item.team.id] = {
          id: item.team.id,
          rating: item.team.rating ?? undefined,
          players: [],
        }
      }
      teams[item.team.id].players.push(new Player(item.player, this.db))
    }

    return Object.values(teams)
  }

  async addTeamsToQueue(teams_ids: number[]) {
    this.db.debug(`addTeamsToQueue: ${teams_ids} to ${this.data.id}`)
    await this.db.drizzle.insert(QueueTeams).values(teams_ids.map(team_id => ({ team_id })))
  }

  async update(data: RankingUpdate): Promise<Ranking> {
    const new_data = (
      await this.db.drizzle
        .update(Rankings)
        .set(data)
        .where(eq(Rankings.id, this.data.id))
        .returning()
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
