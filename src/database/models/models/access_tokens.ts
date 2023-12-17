import { and, eq } from 'drizzle-orm'
import { User } from '..'
import { DbClient } from '../../client'
import { DbObject, DbObjectManager } from '../../managers'
import { AccessTokens } from '../../schema'
import { AccessTokenSelect, AccessTokenUpdate } from '../../types'

export class AccessToken extends DbObject<AccessTokenSelect> {
  async update(user: User, data: AccessTokenUpdate): Promise<this> {
    this.data = (
      await this.db.db
        .update(AccessTokens)
        .set(data)
        .where(
          and(
            eq(AccessTokens.user_id, user.data.id),
            this.data.purpose ? eq(AccessTokens.purpose, this.data.purpose) : undefined
          )
        )
        .returning()
    )[0]
    return this
  }
}

export class AccessTokenManager extends DbObjectManager {
  async get(user_id: string, purpose: string): Promise<AccessToken | undefined> {
    const data = await this.db.db
      .select()
      .from(AccessTokens)
      .where(and(eq(AccessTokens.user_id, user_id), eq(AccessTokens.purpose, purpose)))

    if (data.length > 0) {
      return new AccessToken(data[0], this.db)
    }
  }
}
