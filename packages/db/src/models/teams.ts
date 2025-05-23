import { and, eq, InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { Player } from '.'
import { DbObject, DbObjectManager } from '../classes'
import { DbClient } from '../client'
import { Players, TeamPlayers, Teams } from '../schema'
import { PartialRanking } from './rankings'

export type TeamSelect = InferSelectModel<typeof Teams>
export type TeamInsert = Omit<InferInsertModel<typeof Teams>, 'id'>
export type TeamUpdate = Partial<Omit<TeamInsert, 'ranking_id'>>

export class Team implements DbObject<TeamSelect> {
  constructor(
    public data: TeamSelect,
    public db: DbClient,
  ) {
    db.cache.teams.set(data.id, this)
  }

  get ranking(): PartialRanking {
    return this.db.rankings.get(this.data.ranking_id)
  }

  async players(): Promise<Player[]> {
    const data = await this.db.drizzle
      .select({ player: Players })
      .from(TeamPlayers)
      .where(eq(TeamPlayers.team_id, this.data.id))
      .innerJoin(Players, eq(Players.id, TeamPlayers.player_id))

    return data.map(data => new Player(data.player, this.db))
  }

  async update(data: TeamUpdate): Promise<this> {
    await this.db.drizzle.update(Teams).set(data).where(eq(Teams.id, this.data.id))
    return this
  }

  async addPlayer(player: Player): Promise<this> {
    if (player.data.ranking_id != this.data.ranking_id)
      throw new Error('Players must be in the same ranking to form a team')

    await this.db.drizzle
      .insert(TeamPlayers)
      .values({
        team_id: this.data.id,
        player_id: player.data.id,
      })
      .onConflictDoNothing()
    return this
  }

  async addPlayers(players: Player[]): Promise<this> {
    await Promise.all(players.map(player => this.addPlayer(player)))
    return this
  }

  async removePlayer(player: Player): Promise<this> {
    await this.db.drizzle
      .delete(TeamPlayers)
      .where(and(eq(TeamPlayers.team_id, this.data.id), eq(TeamPlayers.player_id, player.data.id)))
    return this
  }

  async addToQueue(): Promise<void> {
    throw new Error('Not implemented')
  }

  async delete(id: number): Promise<void> {
    await this.db.drizzle.delete(Teams).where(eq(Teams.id, id))
  }
}

export class TeamsManager extends DbObjectManager {
  async create(ranking: PartialRanking, players: Player[], data: Omit<TeamInsert, 'ranking_id'>): Promise<Team> {
    const new_data = (
      await this.db.drizzle
        .insert(Teams)
        .values({ ranking_id: ranking.data.id, ...data })
        .returning()
    )[0]

    const team = new Team(new_data, this.db)

    if (players) {
      await team.addPlayers(players)
    }

    return team
  }

  async fetch(id: number): Promise<Team | undefined> {
    if (this.db.cache.teams.has(id)) return this.db.cache.teams.get(id)!
    const data = (await this.db.drizzle.select().from(Teams).where(eq(Teams.id, id)))[0]
    if (data) {
      return new Team(data, this.db)
    }
  }
}
