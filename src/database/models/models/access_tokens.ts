import { eq } from 'drizzle-orm'

import { AccessTokens } from '../../schema'

import { DbObject, DbObjectManager } from '../../managers'
import { AccessTokenSelect, AccessTokenUpdate } from '../../types'
import { User } from '..'

export class AccessToken extends DbObject<AccessTokenSelect> {
  async update(user: User, data: AccessTokenUpdate): Promise<AccessToken> {
    const new_data = (
      await this.db.db
        .update(AccessTokens)
        .set(data)
        .where(eq(AccessTokens.user_id, user.data.id))
        .returning()
    )[0]
    return new AccessToken(new_data, this.db)
  }
}

export class AccessTokenManager extends DbObjectManager {}
