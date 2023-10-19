import { Users } from '../../schema'
import { eq } from 'drizzle-orm'
import { UserInsert, UserSelect } from '../types'
import { DbClient } from '../../client'
import { DbObject } from '../managers'
import { DbObjectManager } from '../managers'

export class User extends DbObject<UserSelect> {}

export class UsersManager extends DbObjectManager {
  async getOrCreate(data: UserInsert): Promise<User> {
    let result = (await this.client.db.select().from(Users).where(eq(Users.id, data.id)))[0]

    if (result) {
      return new User(result, this.client)
    } else {
      let new_db_data = (
        await this.client.db
          .insert(Users)
          .values({ ...data })
          .returning()
      )[0]
      return new User(new_db_data, this.client)
    }
  }
}
