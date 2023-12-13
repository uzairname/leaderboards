import type { GuildRanking, Player, Ranking, Match } from "../../database/models";

export enum events {
  MatchUpdated = 'match updated', // Match's name, outcome, or metadata modified.
  MatchScored = 'match scored', // A match's players' ratings were updated
  RankingUpdated = 'ranking updated', // Ranking was renamed or modified
  GuildRankingUpdated = 'guild ranking updated', // Guild
}


export const eventArgs = {
  MatchUpdated: (match: Match) => ({
    match,
  }),
}
