import { hash } from '@repo/utils'
import { cache } from '@repo/utils/cache'
import { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { NeonDatabase } from 'drizzle-orm/neon-serverless'
import DbCache from './cache'
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

export class DbClient {
  public readonly cache: DbCache

  constructor(
    readonly drizzle: NeonDatabase | NeonHttpDatabase,
    readonly logger?: DbLogger,
  ) {
    if (cache.db && cache.db instanceof DbCache) {
      this.cache = cache.db
      logger?.log({
        data: {
          cache: `${this.cache}`,
          rankings: `${this.cache.rankings.size}`,
        },
      })
    } else {
      this.cache = new DbCache(logger)
    }
    cache.db = this.cache

    this.logger && (this.debug = this.logger.debug.bind(this.logger))
  }

  debug: (...message: unknown[]) => void = (...message) => {
    console.log(message)
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
}
