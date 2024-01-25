import type { GuildRanking, Match, Player, Ranking } from '../../../database/models'
import { Event } from '../../../utils/events'
import { addRankingChannelsListeners } from '../../modules/leaderboard/leaderboard_messages'
import { addMatchSummaryMessageListeners } from '../../modules/matches/match_logging/match_messages'
import type { App } from '../app'

export function events() {
  return {
    // A new match was created or a match's outcome, metadata, or time was updated
    MatchCreatedOrUpdated: new Event<Match>(),
    // at least one players' points in a ranking were updated
    RankingLeaderboardUpdated: new Event<Ranking>(),
  }
}

export function addAllEventListeners(app: App) {
  addRankingChannelsListeners(app)
  addMatchSummaryMessageListeners(app)
}
