import { QueueTeams, Users } from '../../schema'
import { eq, sql } from 'drizzle-orm'
import { QueueTeamSelect, UserInsert, UserSelect } from '../types'
import { DbObject } from '../managers'
import { DbObjectManager } from '../managers'
import { QueueTeam } from './queue_team'

export class User extends DbObject<UserSelect> {}

export class UsersManager extends DbObjectManager {
  async getOrCreate(data: UserInsert): Promise<User> {
    let result = (await this.db.db.select().from(Users).where(eq(Users.id, data.id)))[0]

    if (result) {
      return new User(result, this.db)
    } else {
      let new_db_data = (
        await this.db.db
          .insert(Users)
          .values({ ...data })
          .returning()
      )[0]
      return new User(new_db_data, this.db)
    }
  }
}
