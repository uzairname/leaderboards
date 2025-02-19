import { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { NeonDatabase } from 'drizzle-orm/neon-serverless'
import { cache } from '../utils/cache'
import DbCache from './cache'
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
import { CustomLogger } from './drizzle-client'

export class DbClient {
  public readonly cache: DbCache

  constructor(readonly drizzle: NeonDatabase | NeonHttpDatabase, readonly logger: CustomLogger) {
    if (cache.db && cache.db instanceof DbCache) {
      this.cache = cache.db
    } else {
      this.cache = new DbCache()
    }
    cache.db = this.cache

    this.debug = this.logger.debug.bind(this.logger)
  }
  
  debug: (...message: unknown[]) => void 

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
