import type { GuildRanking, Match, Player, Ranking } from '../../database/models'
import { Event } from '../../utils/events'
import { addMatchSummaryMessagesListeners } from '../modules/matches/match_logging/match_summary'
import { addRankingChannelsListeners } from '../modules/rankings/ranking_channels'
import type { App } from './app'

export function events() {
  return {
    // a match's players' ratings were updated
    MatchScored: new Event<Match>(),
    // at least one players' points in a ranking were updated
    RankingLeaderboardUpdated: new Event<Ranking>(),
  }
}

export function addAllEventListeners(app: App) {
  addRankingChannelsListeners(app)
  addMatchSummaryMessagesListeners(app)
}
