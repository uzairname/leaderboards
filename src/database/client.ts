import { cache } from '../utils/cache'
import DbCache from './cache'
import { DrizzleClient } from './drizzle-client'
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

  // select: DrizzleClient['select']
  // read: DrizzleClient

  constructor(
    readonly drizzle: DrizzleClient,
    drizzle_read?: DrizzleClient,
  ) {
    if (cache.db && cache.db instanceof DbCache) {
      this.cache = cache.db
    } else {
      this.cache = new DbCache()
    }
    cache.db = this.cache

    // this.select = drizzle.select
    // this.select = drizzle_read ? drizzle_read.select : drizzle.select
    // this.read = drizzle_read ?? drizzle
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
