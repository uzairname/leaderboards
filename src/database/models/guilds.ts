import { eq, InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { DbClient } from '../client'
import { DbErrors } from '../errors'
import { DbObjectManager } from '../managers'
import { Guilds } from '../schema'

export type GuildSelect = InferSelectModel<typeof Guilds>
export type GuildInsert = InferInsertModel<typeof Guilds>

export class PartialGuild {
  constructor(
    public data: { id: string },
    public db: DbClient,
  ) {}

  toString() {
    return `[Guild ${this.data.id}]`
  }

  async fetch(): Promise<Guild> {
    return this.db.guilds.fetch(this.data.id, true)
  }

  async update(data: Partial<Omit<GuildInsert, 'id'>>): Promise<Guild> {
    const new_data = (
      await this.db.drizzle.update(Guilds).set(data).where(eq(Guilds.id, this.data.id)).returning()
    )[0]
    this.data = new_data
    return new Guild(new_data, this.db)
  }
}

export class Guild extends PartialGuild {
  constructor(
    public data: GuildSelect,
    public db: DbClient,
  ) {
    super(data, db)
    db.cache.guilds.set(data.id, this)
  }

  toString() {
    return `[Guild ${this.data.id}: ${this.data.name}]`
  }
}

export class GuildsManager extends DbObjectManager {
  async create(data: GuildInsert): Promise<Guild> {
    const new_db_data = (
      await this.db.drizzle
        .insert(Guilds)
        .values({ ...data })
        .returning()
    )[0]
    return new Guild(new_db_data, this.db)
  }

  get(guild_id: string): PartialGuild {
    return new PartialGuild({ id: guild_id }, this.db)
  }

  async fetch<Required extends boolean>(
    guild_id: string,
    must_exist?: Required,
  ): Promise<Required extends true ? Guild : Guild | null> {
    if (this.db.cache.guilds.has(guild_id)) return this.db.cache.guilds.get(guild_id)!

    const db_data = (await this.db.drizzle.select().from(Guilds).where(eq(Guilds.id, guild_id)))[0]

    if (!db_data) {
      if (must_exist) throw new DbErrors.NotFound(`Guild ${guild_id} not found`)
      return null as any
    }

    return new Guild(db_data, this.db)
  }

  async getAll(): Promise<Guild[]> {
    const db_data = await this.db.drizzle.select().from(Guilds)
    return db_data.map(data => new Guild(data, this.db))
  }
}
