import { and, eq, InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { User } from '.'
import { DbObject, DbObjectManager } from '../classes'
import { DbClient } from '../client'
import { logDbMethods } from '../logging'
import { AccessTokens } from '../schema'

export type AccessTokenSelect = InferSelectModel<typeof AccessTokens>
export type AccessTokenInsert = Omit<InferInsertModel<typeof AccessTokens>, 'id'>
export type AccessTokenUpdate = Partial<Omit<AccessTokenInsert, 'user_id'>>

@logDbMethods
export class AccessToken extends DbObject<AccessTokenSelect> {
  constructor(
    public data: AccessTokenSelect,
    public db: DbClient,
  ) {
    super(data, db)
  }

  toString() {
    return `[AccessToken ${this.data.id}: for user ${this.data.user_id}]`
  }

  async update(data: AccessTokenUpdate): Promise<this> {
    this.data = (
      await this.db.drizzle
        .update(AccessTokens)
        .set(data)
        .where(and(eq(AccessTokens.id, this.data.id)))
        .returning()
    )[0]
    return this
  }

  async delete() {
    await this.db.drizzle.delete(AccessTokens).where(eq(AccessTokens.id, this.data.id))
  }
}

@logDbMethods
export class AccessTokensManager extends DbObjectManager {
  toString() {
    return `[AccessTokensManager]`
  }

  async get(user_id: string): Promise<AccessToken[]> {
    const data = await this.db.drizzle.select().from(AccessTokens).where(eq(AccessTokens.user_id, user_id))

    return data.map(d => new AccessToken(d, this.db))
  }

  async create(data: { user: User } & Omit<AccessTokenInsert, 'user_id'>) {
    await this.db.drizzle.insert(AccessTokens).values({
      user_id: data.user.data.id,
      ...data,
    })
  }
}
