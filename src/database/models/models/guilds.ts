import { eq } from 'drizzle-orm'

import { Guilds, GuildRankings, Rankings } from '../../schema'

import { DbObject, DbObjectManager } from '../managers'
import { GuildSelect, GuildUpdate, GuildInsert } from '../types'
import { GuildRanking, Ranking } from '..'

export class Guild extends DbObject<GuildSelect> {
  async update(data: GuildUpdate) {
    let db_data = (
      await this.db.db.update(Guilds).set(data).where(eq(Guilds.id, this.data.id)).returning()
    )[0]
    this.data = db_data
  }

  async guildRankings() {
    const query_results = await this.db.db
      .select()
      .from(GuildRankings)
      .innerJoin(Rankings, eq(GuildRankings.ranking_id, Rankings.id))
      .where(eq(GuildRankings.guild_id, this.data.id))

    const result = query_results.map((item) => {
      return {
        guild_ranking: new GuildRanking(item.GuildRankings, this.db),
        ranking: new Ranking(item.Rankings, this.db),
      }
    })
    return result
  }
}
export class GuildsManager extends DbObjectManager {
  async create(data: GuildInsert): Promise<Guild> {
    let new_db_data = (
      await this.db.db
        .insert(Guilds)
        .values({ ...data })
        .returning()
    )[0]
    return new Guild(new_db_data, this.db)
  }

  async get(guild_id: string): Promise<Guild | undefined> {
    let db_data = (await this.db.db.select().from(Guilds).where(eq(Guilds.id, guild_id)))[0]
    if (!db_data) return
    return new Guild(db_data, this.db)
  }
}
