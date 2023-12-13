import { and, eq } from 'drizzle-orm'

import { nonNullable } from '../../../utils/utils'

import { Players, QueueTeams, TeamPlayers, Teams } from '../../schema'

import { DbObject, DbObjectManager } from '../managers'
import { TeamInsert, TeamSelect, TeamUpdate } from '../types'
import { Player, Ranking } from '..'

export class Team extends DbObject<TeamSelect> {
  async players(): Promise<Player[]> {
    const data = await this.db.db
      .select({ player: Players })
      .from(TeamPlayers)
      .where(eq(TeamPlayers.team_id, this.data.id))
      .innerJoin(Players, eq(Players.id, TeamPlayers.player_id))

    return data.map((data) => new Player(data.player, this.db))
  }

  async update(data: TeamUpdate): Promise<this> {
    await this.db.db.update(Teams).set(data).where(eq(Teams.id, this.data.id))
    return this
  }

  async addPlayer(player: Player): Promise<this> {
    if (player.data.ranking_id != this.data.ranking_id)
      throw new Error('Players must be in the same ranking to form a team')

    await this.db.db
      .insert(TeamPlayers)
      .values({
        team_id: this.data.id,
        player_id: player.data.id,
      })
      .onConflictDoNothing()
    return this
  }

  async addPlayers(players: Player[]): Promise<this> {
    await Promise.all(players.map((player) => this.addPlayer(player)))
    return this
  }

  async removePlayer(player: Player): Promise<this> {
    await this.db.db
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
    await this.db.db
      .insert(QueueTeams)
      .values({ team_id: this.data.id })
      .onConflictDoUpdate({ target: QueueTeams.team_id, set: { time_created: new Date() } })
  }

  async delete(id: number): Promise<void> {
    await this.db.db.delete(Teams).where(eq(Teams.id, id))
  }
}

export class TeamsManager extends DbObjectManager {
  async create(
    ranking: Ranking,
    data: Omit<TeamInsert, 'ranking_id'>,
    players: Player[] = [],
  ): Promise<Team> {
    data.rating = calculateTeamRating(players, ranking)

    let new_data = (
      await this.db.db
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
    let data = (await this.db.db.select().from(Teams).where(eq(Teams.id, id)))[0]
    if (data) {
      return new Team(data, this.db)
    }
  }
}

function calculateTeamRating(players: Player[], ranking: Ranking): number {
  const initial_rating = nonNullable(ranking.data.elo_settings?.initial_rating, 'initial_rating')
  return players.length > 0
    ? players.reduce((acc, player) => {
        let rating = player.data.rating ?? initial_rating
        return acc + rating
      }, 0) / players.length
    : initial_rating
}
