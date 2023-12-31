import { eq } from 'drizzle-orm'

import { Users } from '../../schema'

import { DbObject, DbObjectManager } from '../managers'
import { UserInsert, UserSelect } from '../types'

export class User extends DbObject<UserSelect> {}

export class UsersManager extends DbObjectManager {
  async getOrCreate(data: UserInsert): Promise<User> {
    let result = (await this.db.db.select().from(Users).where(eq(Users.id, data.id)))[0]

    if (result) {
      return new User(result, this.db)
    } else {
      let new_data = (
        await this.db.db
          .insert(Users)
          .values({ ...data })
          .returning()
      )[0]
      return new User(new_data, this.db)
    }
  }
}
