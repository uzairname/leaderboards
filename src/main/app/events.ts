import type { GuildRanking, Match, Player, Ranking } from '../../database/models'
import { Event } from '../../utils/events'
import { addMatchSummaryMessagesListeners } from '../modules/matches/match_summary'
import { addRankingChannelsListeners } from '../modules/rankings/ranking_channels'
import type { App } from './app'

export function events() {
  return {
    // Match's name, outcome, or metadata modified.
    MatchUpdated: new Event<Match>(),
    // A match's players' ratings were updated
    MatchScored: new Event<Match>(),
    // Ranking was renamed or modified
    RankingUpdated: new Event<Ranking>(),
    // Guild ranking was created
    GuildRankingCreated: new Event<GuildRanking>(),
    // Player's name, rating, or metadata modified.
    PlayerUpdated: new Event<Player>()
  }
}

export function addAllEventListeners(app: App) {
  addRankingChannelsListeners(app)
  addMatchSummaryMessagesListeners(app)
}
