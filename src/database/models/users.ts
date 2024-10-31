import { eq, InferInsertModel, InferSelectModel, sql } from 'drizzle-orm'
import { DbClient } from '../client'
import { DbObject, DbObjectManager } from '../managers'
import { Players, QueueTeams, TeamPlayers, Users } from '../schema'

export type UserSelect = InferSelectModel<typeof Users>
export type UserInsert = InferInsertModel<typeof Users>
export type UserUpdate = Partial<Omit<UserInsert, 'id'>>

export class User extends DbObject<UserSelect> {
  constructor(data: UserSelect, db: DbClient) {
    super(data, db)
    db.cache.users[data.id] = this
  }
}

export class UsersManager extends DbObjectManager {
  async getOrCreate(data: UserInsert): Promise<User> {
    const cached_user = this.db.cache.users[data.id]
    if (cached_user) return cached_user

    const result = (await this.db.drizzle.select().from(Users).where(eq(Users.id, data.id)))[0]

    if (result) {
      return new User(result, this.db)
    } else {
      const new_data = (
        await this.db.drizzle
          .insert(Users)
          .values({ ...data })
          .returning()
      )[0]
      return new User(new_data, this.db)
    }
  }

  async get(id: string): Promise<User | undefined> {
    const cached_user = this.db.cache.users[id]
    if (cached_user) {
      return cached_user
    }

    const result = (await this.db.drizzle.select().from(Users).where(eq(Users.id, id)))[0]

    if (result) {
      return new User(result, this.db)
    }
  }

  async removeFromQueues(id: string): Promise<number> {
    const result = await this.db.drizzle
      .delete(QueueTeams)
      .where(
        sql`${QueueTeams.team_id} in (
          select ${TeamPlayers.team_id} from ${TeamPlayers}
          where ${TeamPlayers.player_id} in (
            select ${Players.id} from ${Players}
            where ${Players.user_id} = ${id}
          )
        )`,
      )
      .returning() // prettier-ignore
    return result.length
  }
}
