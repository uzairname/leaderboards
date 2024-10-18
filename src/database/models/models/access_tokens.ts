import { and, eq } from 'drizzle-orm'
import { User } from '..'
import { DbObject, DbObjectManager } from '../../managers'
import { AccessTokens } from '../../schema'
import { AccessTokenInsert, AccessTokenSelect, AccessTokenUpdate } from '../../types'

export class AccessToken extends DbObject<AccessTokenSelect> {
  async update(data: AccessTokenUpdate): Promise<this> {
    this.data = (
      await this.db.db
        .update(AccessTokens)
        .set(data)
        .where(and(eq(AccessTokens.id, this.data.id)))
        .returning()
    )[0]
    return this
  }
}

export class AccessTokensManager extends DbObjectManager {
  async get(user_id: string): Promise<AccessToken[]> {
    const data = await this.db.db
      .select()
      .from(AccessTokens)
      .where(eq(AccessTokens.user_id, user_id))

    return data.map(d => new AccessToken(d, this.db))
  }

  async create(data: { user: User } & Omit<AccessTokenInsert, 'user_id'>) {
    await this.db.db.insert(AccessTokens).values({
      user_id: data.user.data.id,
      ...data,
    })
  }
}
