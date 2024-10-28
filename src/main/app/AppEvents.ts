import { Event } from '../../utils/Event'
import type { Guild, Match, Ranking } from '../../database/models'
import { App } from './App'

export class AppEvents {
  constructor(private app: App) {}

  // A new match was created or a match's outcome, metadata, or time was updated
  MatchCreatedOrUpdated = new AppEvent<Match>(this.app)

  // at least one players' points in a ranking were updated
  RankingLeaderboardUpdated = new AppEvent<Ranking>(this.app)

  // A ranking in a guild was created, deleted, or renamed
  GuildRankingsModified = new AppEvent<Guild>(this.app)
}

export class AppEvent<EventData> extends Event<App, EventData> {}
