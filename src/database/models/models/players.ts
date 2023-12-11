import { and, eq, sql } from 'drizzle-orm'

import { Players, QueueTeams, TeamPlayers, Teams } from '../../schema'

import { DbObject, DbObjectManager } from '../managers'
import { PlayerSelect, PlayerUpdate, PlayerInsert } from '../types'
import { User, Ranking, Team } from '..'

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
      .select({team: Teams}).from(TeamPlayers)
      .where(eq(TeamPlayers.user_id, this.data.user_id))
      .innerJoin(Teams,
        and(
          eq(Teams.id, TeamPlayers.team_id), 
          eq(Teams.ranking_id, this.data.ranking_id)
        ),
      )

    return data.map((data) => new Team(data.team, this.db))
  }

  async queueTeams() {
    const data = await this.db.db
      .select({ team: Teams })
      .from(QueueTeams).innerJoin(TeamPlayers,
        and(
          eq(TeamPlayers.team_id, QueueTeams.team_id),
        ),
      ).innerJoin(Teams,
        and(
          eq(Teams.id, QueueTeams.team_id),
        ),
      ).where(
        and(
          eq(TeamPlayers.user_id, this.data.user_id),
          eq(Teams.ranking_id, this.data.ranking_id),
        )
      )
    return data.map((data) => new Team(data.team, this.db))
  }

  async removeTeamsFromQueue(): Promise<void> {
    await this.db.db.execute(
      sql`DELETE FROM ${QueueTeams}
      WHERE ${QueueTeams.team_id} IN (
        SELECT ${TeamPlayers.team_id} FROM ${TeamPlayers}
        INNER JOIN ${Teams} ON ${Teams.id} = ${TeamPlayers.team_id}
        WHERE ${TeamPlayers.user_id} = ${this.data.user_id}
        AND ${Teams.ranking_id} = ${this.data.ranking_id}
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

  getPartial(user_id: string, ranking_id: number): Player {
    return new Player({ 
      user_id, 
      ranking_id,
      name: null,
      rating: null,
      time_created: null,
      rd: null,
      stats: null,
    }, this.db)
  }
}
