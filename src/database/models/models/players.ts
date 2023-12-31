import { and, eq, sql } from 'drizzle-orm'

import { Players, QueueTeams, TeamPlayers, Teams } from '../../schema'

import { DbObject, DbObjectManager } from '../managers'
import { PlayerSelect, PlayerUpdate, PlayerInsert } from '../types'
import { User, Ranking, Team } from '..'
import { DatabaseErrors } from '../../utils/errors'

export class Player extends DbObject<PlayerSelect> {
  async update(data: PlayerUpdate): Promise<Player> {
    const new_data = (
      await this.db.db
        .update(Players)
        .set(data)
        .where(
          and(eq(Players.user_id, this.data.user_id), eq(Players.ranking_id, this.data.ranking_id)),
        )
        .returning()
    )[0]
    return new Player(new_data, this.db)
  }

  async teams(): Promise<Team[]> {
    const data = await this.db.db
      .select({ team: Teams })
      .from(TeamPlayers)
      .where(eq(TeamPlayers.player_id, this.data.id))
      .innerJoin(Teams, and(eq(Teams.id, TeamPlayers.team_id)))

    return data.map((data) => new Team(data.team, this.db))
  }

  async queueTeams(): Promise<{ team: Team; in_queue: boolean }[]> {
    const data = await this.db.db
      .select({ team: Teams, queue_team: QueueTeams })
      .from(Teams)
      .innerJoin(
        TeamPlayers,
        and(eq(TeamPlayers.team_id, Teams.id), eq(TeamPlayers.player_id, this.data.id)),
      )
      .leftJoin(QueueTeams, eq(QueueTeams.team_id, Teams.id))

    return data.map((data) => ({ team: new Team(data.team, this.db), in_queue: !!data.queue_team }))
  }

  async removeTeamsFromQueue(): Promise<void> {
    await this.db.db.execute(
      sql`DELETE FROM ${QueueTeams}
      WHERE ${QueueTeams.team_id} IN (
        SELECT ${TeamPlayers.team_id} FROM ${TeamPlayers}
        INNER JOIN ${Teams} ON 
          ${Teams.id} = ${TeamPlayers.team_id} 
          AND ${TeamPlayers.player_id} = ${this.data.id}
      )`,
    )
  }
}

export class PlayersManager extends DbObjectManager {
  // when creating, pass in user and ranking objects instead of ids
  async create(
    user: User,
    ranking: Ranking,
    data?: Omit<PlayerInsert, 'user_id' | 'ranking_id'>,
  ): Promise<Player> {
    let new_data = (
      await this.db.db
        .insert(Players)
        .values({ user_id: user.data.id, ranking_id: ranking.data.id, ...data })
        .returning()
    )[0]
    return new Player(new_data, this.db)
  }

  async get(user_id: string, ranking: number): Promise<Player | undefined> {
    let data = (
      await this.db.db
        .select()
        .from(Players)
        .where(and(eq(Players.user_id, user_id), eq(Players.ranking_id, ranking)))
    )[0]
    if (!data) return
    return new Player(data, this.db)
  }

  async getById(id: number): Promise<Player> {
    let data = (await this.db.db.select().from(Players).where(eq(Players.id, id)))[0]
    if (!data) throw new DatabaseErrors.NotFoundError(`Player ${id} doesn't exist`)
    return new Player(data, this.db)
  }
}
