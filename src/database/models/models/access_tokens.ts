import { eq } from 'drizzle-orm'
import { DbObject } from '../../object_manager'
import { DbObjectManager } from '../../object_manager'
import { AccessTokenSelect, AccessTokenUpdate } from '../types'
import { User } from '..'
import { AccessTokens } from '../../schema'

export class AccessToken extends DbObject<AccessTokenSelect> {
  async update(user: User, data: AccessTokenUpdate): Promise<AccessToken> {
    let new_data = (
      await this.client.db
        .update(AccessTokens)
        .set(data)
        .where(eq(AccessTokens.user_id, user.data.id))
        .returning()
    )[0]
    return new AccessToken(new_data, this.client)
  }
}

export class AccessTokenManager extends DbObjectManager {}
