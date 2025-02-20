import { eq, InferInsertModel, InferSelectModel, sql } from 'drizzle-orm'
import { DbObjectManager } from '../classes'
import { DbClient } from '../client'
import { Players, QueueTeams, TeamPlayers, Users } from '../schema'
import { Player } from './players'

export type UserSelect = InferSelectModel<typeof Users>
export type UserInsert = InferInsertModel<typeof Users>
export type UserUpdate = Partial<Omit<UserInsert, 'id'>>

export class PartialUser {
  constructor(
    public data: { id: string },
    public db: DbClient,
  ) {}

  toString() {
    return `[User ${this.data.id}]`
  }

  async fetch(): Promise<User> {
    const data = (await this.db.drizzle.select().from(Users).where(eq(Users.id, this.data.id)))[0]
    if (!data) throw new Error(`User ${this.data.id} doesn't exist`)
    return new User(data, this.db)
  }

  async players(): Promise<Player[]> {
    const data = await this.db.drizzle
      .select()
      .from(Players)
      .where(eq(Players.user_id, this.data.id))
    return data.map(data => new Player(data, this.db))
  }

  async removePlayersFromQueue(): Promise<number> {
    const result = await this.db.drizzle
      .update(Players)
      .set({ time_joined_queue: null })
      .where(eq(Players.user_id, this.data.id))
      .returning()
    return result.length
  }

  private async removeFromTeamQueues(): Promise<number> {
    const result = await this.db.drizzle
      .delete(QueueTeams)
      .where(
        sql`${QueueTeams.team_id} in (
          select ${TeamPlayers.team_id} from ${TeamPlayers}
          where ${TeamPlayers.player_id} in (
            select ${Players.id} from ${Players}
            where ${Players.user_id} = ${this.data.id}
          )
        )`,
      )
      .returning() // prettier-ignore
    return result.length
  }
}

export class User extends PartialUser {
  constructor(
    public data: UserSelect,
    public db: DbClient,
  ) {
    super({ id: data.id }, db)
    this.db.cache.users.set(data.id, this)
  }
  toString() {
    return `[User ${this.data.id}: ${this.data.name}]`
  }
}

export class UsersManager extends DbObjectManager {
  get(id: string): PartialUser {
    return new PartialUser({ id }, this.db)
  }

  async fetch(id: string): Promise<User | undefined> {
    if (this.db.cache.users.has(id)) return this.db.cache.users.get(id)!

    const result = (await this.db.drizzle.select().from(Users).where(eq(Users.id, id)))[0]

    if (result) {
      return new User(result, this.db)
    }
  }

  async getOrCreate(data: UserInsert): Promise<User> {
    if (this.db.cache.users.has(data.id)) return this.db.cache.users.get(data.id)!

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
}
