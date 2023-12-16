import { NeonDatabase } from 'drizzle-orm/neon-serverless'

import * as schema from './schema'
import { Sentry } from '../request/sentry'

import { cache } from '../request/cache'

import { connect } from './connect'
import {
  SettingsManager,
  UsersManager,
  GuildsManager,
  GuildRankingsManager,
  RankingsManager,
  MatchesManager,
  PlayersManager,
  TeamsManager,
} from './models'
import DbCache from './cache'

export class DbClient {
  public readonly db: NeonDatabase<typeof schema>

  public readonly cache: DbCache

  constructor(postgres_url: string, sentry?: Sentry) {
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
  guilds = new GuildsManager(this)
  rankings = new RankingsManager(this)
  guild_rankings = new GuildRankingsManager(this)
  players = new PlayersManager(this)
  teams = new TeamsManager(this)
  matches = new MatchesManager(this)
}
