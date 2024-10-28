import { and, eq, InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { Player, Ranking } from '.'
import { nonNullable } from '../../utils/utils'
import { DbClient } from '../client'
import { DbObject, DbObjectManager } from '../managers'
import { Players, QueueTeams, TeamPlayers, Teams } from '../schema'

export type TeamSelect = InferSelectModel<typeof Teams>
export type TeamInsert = Omit<InferInsertModel<typeof Teams>, 'id'>
export type TeamUpdate = Partial<Omit<TeamInsert, 'ranking_id'>>

export class Team extends DbObject<TeamSelect> {
  constructor(data: TeamSelect, db: DbClient) {
    super(data, db)
    db.cache.teams[data.id] = this
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

  protected async updateRating(): Promise<void> {
    const players = await this.players()
    const ranking = await this.db.rankings.get(this.data.ranking_id)
    const rating = calculateTeamRating(players, ranking)
    await this.update({ rating })
  }

  async addToQueue(): Promise<void> {
    // if already in queue
    await this.db.drizzle
      .insert(QueueTeams)
      .values({ team_id: this.data.id })
      .onConflictDoUpdate({ target: QueueTeams.team_id, set: { time_created: new Date() } })
  }

  async delete(id: number): Promise<void> {
    await this.db.drizzle.delete(Teams).where(eq(Teams.id, id))
  }
}

export class TeamsManager extends DbObjectManager {
  async create(
    ranking: Ranking,
    data: Omit<TeamInsert, 'ranking_id'>,
    players: Player[] = [],
  ): Promise<Team> {
    data.rating = calculateTeamRating(players, ranking)

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

  async get(id: number): Promise<Team | undefined> {
    const cached_team = this.db.cache.teams[id]
    if (cached_team) return cached_team
    const data = (await this.db.drizzle.select().from(Teams).where(eq(Teams.id, id)))[0]
    if (data) {
      return new Team(data, this.db)
    }
  }
}

function calculateTeamRating(players: Player[], ranking: Ranking): number {
  const initial_rating = nonNullable(ranking.data.elo_settings?.initial_rating, 'initial_rating')
  return players.length > 0
    ? players.reduce((acc, player) => {
        const rating = player.data.rating ?? initial_rating
        return acc + rating
      }, 0) / players.length
    : initial_rating
}
