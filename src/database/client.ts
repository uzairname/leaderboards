import { NeonDatabase } from 'drizzle-orm/neon-serverless'

import * as schema from './schema'
import { Sentry } from '../utils/sentry'
import { config } from '../utils/globals'

import { connect } from './connect'
import DbCache from './utils/cache'
import {
  SettingsManager,
  UsersManager,
  GuildsManager,
  GuildLeaderboardsManager,
  LeaderboardsManager,
  LeaderboardDivisionsManager,
  MatchesManager,
  PlayersManager,
  QueueTeamsManager,
} from './models'
import { cache } from '../utils/cache'

export class DbClient {
  public readonly db: NeonDatabase<typeof schema>

  constructor(
    public sentry?: Sentry,
    postgres_url = config.env.POSTGRES_URL,
  ) {
    this.db = connect(postgres_url)
    if (cache.get('db') === undefined) {
      cache.set('db', new DbCache())
    }
  }

  settings = new SettingsManager(this)
  users = new UsersManager(this)
  guilds = new GuildsManager(this)
  leaderboards = new LeaderboardsManager(this)
  guild_leaderboards = new GuildLeaderboardsManager(this)
  leaderboard_divisions = new LeaderboardDivisionsManager(this)
  players = new PlayersManager(this)
  queue_teams = new QueueTeamsManager(this)
  matches = new MatchesManager(this)

  log(message: string) {
    if (this.sentry) {
      this.sentry.addBreadcrumb({
        category: 'database',
        message: message,
        level: 'info',
      })
    } else {
      console.log(message)
    }
  }
}
