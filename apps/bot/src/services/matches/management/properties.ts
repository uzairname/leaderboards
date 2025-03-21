import { Match, MatchStatus } from '@repo/db/models'
import { maxIndex } from '@repo/utils'


export function getOutcomeWinners(outcome: number[]) {
  const winning_teams = maxIndex(outcome)
  return { winning_team_indices: winning_teams, is_draw: winning_teams.length === outcome.length }
}

/**
 * @returns The indices of the winning team, and whether it is a full draw.
 * Returns undefined if the match is not finished.
 */
export function getMatchWinners(match: Match): { winning_team_indices?: number[]; is_draw?: boolean } {
  if (match.data.status !== MatchStatus.Finished || !match.data.outcome) {
    return {}
  }
  return getOutcomeWinners(match.data.outcome)
}
