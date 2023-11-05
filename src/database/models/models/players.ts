import { and, eq } from 'drizzle-orm'
import { Players } from '../../schema'
import { PlayerSelect, PlayerUpdate, PlayerInsert } from '../types'
import { DbObject } from '../managers'
import { DbObjectManager } from '../managers'
import { RankingDivision } from './ranking_divisions'
import { User } from './users'

export class Player extends DbObject<PlayerSelect> {
  async update(data: PlayerUpdate): Promise<Player> {
    let new_data = (
      await this.db.conn
        .update(Players)
        .set(data)
        .where(
          and(
            eq(Players.user_id, this.data.user_id),
            eq(Players.ranking_division_id, this.data.ranking_division_id),
          ),
        )
        .returning()
    )[0]
    return new Player(new_data, this.db)
  }
}

export class PlayersManager extends DbObjectManager {
  // when creating, pass in user and division objects instead of ids
  async create(
    user: User,
    division: RankingDivision,
    data?: Omit<PlayerInsert, 'user_id' | 'ranking_division_id'>,
  ): Promise<Player> {
    let new_data = (
      await this.db.conn
        .insert(Players)
        .values({ user_id: user.data.id, ranking_division_id: division.data.id, ...data })
        .returning()
    )[0]
    return new Player(new_data, this.db)
  }

  async get(user_id: string, division_id: number): Promise<Player | undefined> {
    let data = (
      await this.db.conn
        .select()
        .from(Players)
        .where(and(eq(Players.user_id, user_id), eq(Players.ranking_division_id, division_id)))
    )[0]
    if (!data) return
    return new Player(data, this.db)
  }
}
