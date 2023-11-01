import { eq, sql } from 'drizzle-orm'
import { QueueTeams } from '../../schema'
import { DbObject } from '../managers'
import { DbObjectManager } from '../managers'
import { QueueTeamInsert, QueueTeamSelect, QueueTeamUpdate } from '../types'

export class QueueTeam extends DbObject<QueueTeamSelect> {
  async update(data: QueueTeamUpdate): Promise<QueueTeam> {
    let new_data = (
      await this.db.db
        .update(QueueTeams)
        .set({ ...data })
        .where(eq(QueueTeams.id, this.data.id))
        .returning()
    )[0]
    return new QueueTeam(new_data, this.db)
  }
}
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

  async getByUser(user_id: string): Promise<QueueTeam[]> {
    let query_result = await this.db.db.execute(sql`
            SELECT * FROM ${QueueTeams}
            WHERE ${QueueTeams.user_ids} ?| ARRAY[${user_id}]
        `)
    let data = query_result.rows as QueueTeamSelect[]
    return data.map((item) => new QueueTeam(item, this.db))
  }

  async getByUserAndDivision(user_id: string, division_id: number): Promise<QueueTeam | undefined> {
    let query_result = await this.db.db.execute(sql`
            SELECT * FROM ${QueueTeams}
            WHERE ${QueueTeams.user_ids} ?| ARRAY[${user_id}]
            AND ${QueueTeams.queued_ranking_division_id} = ${division_id}
        `)
    let data = query_result.rows as QueueTeamSelect[]
    if (data.length == 0) return
    return new QueueTeam(data[0], this.db)
  }
}
