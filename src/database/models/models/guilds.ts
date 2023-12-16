import { eq } from 'drizzle-orm'

import { Guilds, GuildRankings, Rankings } from '../../schema'

import { DbClient } from '../../client'
import { DbObject, DbObjectManager } from '../../managers'

import type { GuildSelect, GuildUpdate, GuildInsert } from '../../types'
import { GuildRanking, Ranking } from '..'

export class Guild extends DbObject<GuildSelect> {
  constructor(data: GuildSelect, db: DbClient) {
    super(data, db)
    db.cache.guilds[data.id] = this
  }

  async update(data: GuildUpdate) {
    const db_data = (
      await this.db.db.update(Guilds).set(data).where(eq(Guilds.id, this.data.id)).returning()
    )[0]
    this.data = db_data
  }
}

export class GuildsManager extends DbObjectManager {
  async create(data: GuildInsert): Promise<Guild> {
    const new_db_data = (
      await this.db.db
        .insert(Guilds)
        .values({ ...data })
        .returning()
    )[0]
    return new Guild(new_db_data, this.db)
  }

  async get(guild_id: string): Promise<Guild | undefined> {
    const cached_guild = this.db.cache.guilds[guild_id]
    if (cached_guild) return cached_guild
    const db_data = (await this.db.db.select().from(Guilds).where(eq(Guilds.id, guild_id)))[0]
    if (!db_data) return
    return new Guild(db_data, this.db)
  }
}
