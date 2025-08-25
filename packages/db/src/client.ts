import { hash } from '@repo/utils'
import { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { NeonDatabase } from 'drizzle-orm/neon-serverless'
import { DbCache } from './cache'
import { logDbMethods } from './logging'
import { DbLogger } from './logging/db-logger'
import {
  AccessTokensManager,
  GuildRankingsManager,
  GuildsManager,
  MatchesManager,
  PlayersManager,
  RankingsManager,
  SettingsManager,
  TeamsManager,
  UsersManager,
} from './models'

@logDbMethods
export class DbClient {
  public readonly cache: DbCache

  constructor(
    readonly drizzle: NeonDatabase | NeonHttpDatabase,
    readonly logger?: DbLogger,
  ) {
    this.cache = DbCache.getInstance(this, logger)
  }

  async withCache<K extends object, T>(fn: (arg: K) => T, arg: K, key: string) {
    const fullkey = `${key}:${hash(arg)}`
    const cached_item = this.cache.others.get(fullkey) as T
    if (cached_item) {
      return cached_item
    }
    const item = fn(arg)
    this.cache.others.set(fullkey, item)
    return item
  }

  settings = new SettingsManager(this)
  users = new UsersManager(this)
  access_tokens = new AccessTokensManager(this)
  guilds = new GuildsManager(this)
  rankings = new RankingsManager(this)
  guild_rankings = new GuildRankingsManager(this)
  players = new PlayersManager(this)
  teams = new TeamsManager(this)
  matches = new MatchesManager(this)

  async measureLatency(): Promise<number> {
    const start = performance.now()
    // await this.drizzle.execute('SELECT 1')
    await this.drizzle.execute('update "Settings" set id=1 where id=1')
    const latency = performance.now() - start
    return latency
  }

  toJSON() {
    return '[DbClient]'
  }
}
