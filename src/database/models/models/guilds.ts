import { eq } from 'drizzle-orm'

import { GuildLeaderboard } from './guild_leaderboards'
import { Leaderboard } from './leaderboards'
import { Guilds, GuildLeaderboards, Leaderboards } from '../../schema'
import { DbObject } from '../managers'
import { DbObjectManager } from '../managers'
import { GuildSelect, GuildUpdate, GuildInsert } from '../types'

export class Guild extends DbObject<GuildSelect> {
  async update(data: GuildUpdate) {
    let db_data = (
      await this.client.db.update(Guilds).set(data).where(eq(Guilds.id, this.data.id)).returning()
    )[0]
    this.data = db_data
  }

  async guildLeaderboards(): Promise<
    {
      guild_leaderboard: GuildLeaderboard
      leaderboard: Leaderboard
    }[]
  > {
    const query_results = await this.client.db
      .select()
      .from(GuildLeaderboards)
      .innerJoin(Leaderboards, eq(GuildLeaderboards.leaderboard_id, Leaderboards.id))
      .where(eq(GuildLeaderboards.guild_id, this.data.id))

    const result = query_results.map((item) => {
      return {
        guild_leaderboard: new GuildLeaderboard(item.GuildLeaderboards, this.client),
        leaderboard: new Leaderboard(item.Leaderboards, this.client),
      }
    })
    return result
  }
}
export class GuildsManager extends DbObjectManager {
  async create(data: GuildInsert): Promise<Guild> {
    let new_db_data = (
      await this.client.db
        .insert(Guilds)
        .values({ ...data })
        .returning()
    )[0]
    return new Guild(new_db_data, this.client)
  }

  async get(guild_id: string): Promise<Guild | undefined> {
    let db_data = (await this.client.db.select().from(Guilds).where(eq(Guilds.id, guild_id)))[0]
    if (!db_data) return
    return new Guild(db_data, this.client)
  }
}
