import { eq, sql } from 'drizzle-orm'
import { QueueTeams } from '../../schema'
import { DbObject } from '../../object_manager'
import { DbObjectManager } from '../../object_manager'
import { QueueTeamInsert, QueueTeamSelect, QueueTeamUpdate } from '../types'

export class QueueTeam extends DbObject<QueueTeamSelect> {
  async update(data: QueueTeamUpdate): Promise<QueueTeam> {
    let new_data = (
      await this.client.db
        .update(QueueTeams)
        .set({ ...data })
        .where(eq(QueueTeams.id, this.data.id))
        .returning()
    )[0]
    return new QueueTeam(new_data, this.client)
  }
}
export class QueueTeamsManager extends DbObjectManager {
  async create(data: QueueTeamInsert): Promise<QueueTeam> {
    let new_data = (
      await this.client.db
        .insert(QueueTeams)
        .values({ ...data })
        .returning()
    )[0]

    return new QueueTeam(new_data, this.client)
  }

  async getByUser(user_id: string): Promise<QueueTeam[]> {
    let query_result = await this.client.db.execute(sql`
            SELECT * FROM ${QueueTeams}
            WHERE ${QueueTeams.user_ids} ?| ARRAY[${user_id}]
        `)
    let data = query_result.rows as QueueTeamSelect[]
    return data.map((item) => new QueueTeam(item, this.client))
  }
}
