import { NeonDatabase } from 'drizzle-orm/neon-serverless'

import * as schema from './schema'
import { Sentry } from '../logging/sentry'

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
  QueueTeamsManager,
  TeamsManager,
} from './models'
import { cache } from '../utils/cache'

export class DbClient {
  public readonly db: NeonDatabase<typeof schema>

  constructor(
    postgres_url: string,
    public sentry?: Sentry,
  ) {
    this.db = connect(postgres_url)
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
  // queue_teams = new QueueTeamsManager(this)
  matches = new MatchesManager(this)
}
