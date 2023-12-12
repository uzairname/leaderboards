import { NeonDatabase } from 'drizzle-orm/neon-serverless'

import * as schema from './schema'
import { Sentry } from '../request/sentry'

import { connect } from './connect'
import DbCache from './utils/cache'
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
import { cache } from '../request/cache'

export class DbClient {
  public readonly db: NeonDatabase<typeof schema>

  constructor(postgres_url: string, sentry?: Sentry) {
    this.db = connect(postgres_url, sentry)
    if (cache.get('db') === undefined) {
      cache.set('db', new DbCache())
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
