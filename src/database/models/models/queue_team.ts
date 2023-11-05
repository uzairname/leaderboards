import { eq, sql } from 'drizzle-orm'
import { QueueTeams } from '../../schema'
import { DbObject } from '../managers'
import { DbObjectManager } from '../managers'
import { QueueTeamInsert, QueueTeamSelect, QueueTeamUpdate } from '../types'

export class QueueTeam extends DbObject<QueueTeamSelect> {}

export class QueueTeamsManager extends DbObjectManager {
  async create(data: QueueTeamInsert): Promise<QueueTeam> {
    let new_data = (
      await this.db.db
        .insert(QueueTeams)
        .values({ ...data })
        .returning()
    )[0]

    return new QueueTeam(new_data, this.db)
  }
}
