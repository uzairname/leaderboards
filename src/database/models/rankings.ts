import { and, desc, eq, inArray, InferInsertModel, InferSelectModel, sql } from 'drizzle-orm'
import { Player } from '.'
import { sentry } from '../../logging/sentry'
import { DbClient } from '../client'
import { DbErrors } from '../errors'
import { DbObject, DbObjectManager } from '../managers'
import { Players, QueueTeams, Rankings, TeamPlayers, Teams } from '../schema'
import { PlayerFlags } from './players'
import { MatchMetadata } from './matches'

export type RankingSelect = InferSelectModel<typeof Rankings>
export type RankingInsert = Omit<InferInsertModel<typeof Rankings>, 'id'>
export type RankingUpdate = Partial<RankingInsert>

export type EloSettings = {
  initial_rating: number
  initial_rd: number
}

export type MatchmakingSettings = {
  queue_enabled?: boolean
  direct_challenge_enabled?: boolean
  default_metadata?: MatchMetadata
}

export class Ranking extends DbObject<RankingSelect> {
  constructor(data: RankingSelect, db: DbClient) {
    super(data, db)
    db.cache.rankings[data.id] = this
  }

  toString() {
    return `[Ranking ${this.data.id}: ${this.data.name}]`
  }

  /**
   *
   * @returns The top players in this ranking, ordered by highest rating to lowest
   */
  async getOrderedTopPlayers(limit?: number): Promise<Player[]> {
    sentry.debug(`getOrderedTopPlayers: ${this}`)
    const query = this.db.drizzle
      .select()
      .from(Players)
      .where(
        and(
          eq(Players.ranking_id, this.data.id),
          sql`${Players.flags} & ${PlayerFlags.Disabled} = 0`,
        ),
      )
      .orderBy(desc(Players.rating))

    if (limit) query.limit(limit)

    const players = await query

    return players.map(item => {
      return new Player(item, this.db)
    })
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
    num_teams: number,
  ): Promise<{ id: number; rating?: number; players: Player[] }[] | null> {
    sentry.debug(`popTeamsFromQueue: ${num_teams} teams from ${this}`)
    // check if there are enough teams in the queue

    // Choose n_teams queue teams to delete
    const team_ids_to_delete = await this.db.drizzle
      .select({id: QueueTeams.team_id}).from(QueueTeams)
      .innerJoin(Teams, eq(QueueTeams.team_id, Teams.id))
      .where(eq(Teams.ranking_id, this.data.id))
      .limit(num_teams)

    sentry.debug(`found ${team_ids_to_delete.length} teams: ${team_ids_to_delete.map(t => t.id)}`)
    
    if (team_ids_to_delete.length < num_teams) return null

    const result = await this.db.drizzle.delete(QueueTeams).where(
      inArray(QueueTeams.team_id, team_ids_to_delete.map(t => t.id))
    ).returning()

    // select the resulting teams
    const team_ids = result.map(item => item.team_id)
    const data = await this.db.drizzle
      .select({ player: Players, team: Teams }).from(TeamPlayers)
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
    sentry.debug(`addTeamsToQueue: ${teams_ids} to ${this.data.name}`)
    await this.db.drizzle.insert(QueueTeams).values(teams_ids.map(team_id => ({ team_id })))
  }

  async update(data: RankingUpdate): Promise<this> {
    this.data = (
      await this.db.drizzle
        .update(Rankings)
        .set(data)
        .where(eq(Rankings.id, this.data.id))
        .returning()
    )[0]
    return this
  }

  async delete() {
    await this.db.drizzle.delete(Rankings).where(eq(Rankings.id, this.data.id))
    delete this.db.cache.rankings[this.data.id]
    this.db.cache.guild_rankings = {}
    this.db.cache.guild_guild_rankings = {}
    delete this.db.cache.players[this.data.id]
    this.db.cache.players_by_id = {}
    this.db.cache.teams = {}
    this.db.cache.matches = {}
    this.db.cache.match_team_players = {}
  }
}

export class RankingsManager extends DbObjectManager {
  async create(data: RankingInsert): Promise<Ranking> {
    const new_data = (await this.db.drizzle.insert(Rankings).values(data).returning())[0]
    return new Ranking(new_data, this.db)
  }

  async get(ranking_id: number): Promise<Ranking> {
    const cached_ranking = this.db.cache.rankings[ranking_id]
    if (cached_ranking) {
      sentry.debug(`cache hit for ${cached_ranking}`)
      return cached_ranking
    }

    const data = (
      await this.db.drizzle.select().from(Rankings).where(eq(Rankings.id, ranking_id))
    )[0]
    if (!data) {
      throw new DbErrors.NotFound(`Ranking ${ranking_id} doesn't exist`)
    }
    return new Ranking(data, this.db)
  }
}
