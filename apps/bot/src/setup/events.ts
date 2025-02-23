import { Guild, Match, Ranking } from '@repo/db/models'
import { Event } from '@repo/utils'
import { App } from './app'

export class AppEvent<EventData> extends Event<App, EventData> {}

export function getAppEvents(app: App, all_event_listeners: ((events: AppEvents) => void)[]) {
  const events = {
    // A new match was created or a match's outcome, metadata, or time was updated
    MatchCreatedOrUpdated: new AppEvent<Match>(app),
    // at least one players' points in a ranking were updated
    RankingLeaderboardUpdated: new AppEvent<Ranking>(app),
    // A ranking in a guild was created, deleted, or renamed
    GuildRankingsModified: new AppEvent<Guild>(app),
  }

  all_event_listeners.forEach(register => register(events))

  return events
}

export type AppEvents = ReturnType<typeof getAppEvents>
