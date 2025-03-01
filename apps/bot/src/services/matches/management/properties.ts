import { Match, MatchStatus } from '@repo/db/models'
import { maxIndex } from '@repo/utils'

/**
 * @returns The indices of the winning team, and whether it is a draw.
 * Returns undefined if the match is not finished.
 */
export function getOutcome(match: Match): { winning_team_indices?: number[]; is_draw?: boolean } {
  if (match.data.status !== MatchStatus.Finished || !match.data.outcome) {
    return {}
  }
  const winning_teams = maxIndex(match.data.outcome)
  return { winning_team_indices: winning_teams, is_draw: winning_teams.length === match.data.outcome.length }
}
