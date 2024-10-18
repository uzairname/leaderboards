import { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { cache } from '../request/cache'
import { Logger } from '../request/logging'
import DbCache from './cache'
import { connect } from './connect'
import {
  GuildRankingsManager,
  GuildsManager,
  MatchesManager,
  PlayersManager,
  RankingsManager,
  SettingsManager,
  TeamsManager,
  UsersManager,
} from './models'
import { AccessTokensManager } from './models/models/access_tokens'
import * as schema from './schema'

export class DbClient {
  public readonly db: NeonHttpDatabase<typeof schema>

  public readonly cache: DbCache

  constructor(postgres_url: string, sentry?: Logger) {
    this.db = connect(postgres_url, sentry)

    if (cache.db && cache.db instanceof DbCache) {
      this.cache = cache.db
    } else {
      this.cache = new DbCache()
      cache.db = this.cache
    }
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
