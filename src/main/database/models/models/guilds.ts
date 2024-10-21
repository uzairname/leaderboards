import { eq } from 'drizzle-orm'
import { DbClient } from '../../client'
import { DbObject, DbObjectManager } from '../../managers'
import { Guilds } from '../../schema'
import type { GuildInsert, GuildSelect } from '../types'

export class Guild extends DbObject<GuildSelect> {
  constructor(data: GuildSelect, db: DbClient) {
    super(data, db)
    db.cache.guilds[data.id] = this
  }

  async update(data: Partial<Omit<GuildInsert, 'id'>>): Promise<this> {
    this.data = (
      await this.db.db.update(Guilds).set(data).where(eq(Guilds.id, this.data.id)).returning()
    )[0]
    return this
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
