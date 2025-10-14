import { MatchOutcome, OutcomeType } from '../../../../../../packages/db/src/models/matches'

/**
 * Converts an array of numbers to their ranks. Assumes greater number is better
 * Specifically, each element in the output array is the number of unique elements in 'nums'
 * that are greater than or equal to the corresponding element in 'nums'
 */
export function scoresToRanks(scores: number[]): number[] {
  const sortedUniqueNums = [...new Set(scores)].sort((a, b) => b - a)

  const rankMap = new Map<number, number>()
  sortedUniqueNums.forEach((num, index) => {
    rankMap.set(num, index + 1)
  })

  const ranks = scores.map(num => rankMap.get(num)!)

  return ranks
}

/**
 * Converts team scores to a normalized scale of 0 (loss), 0.5 (draw), or 1 (win).
 */
export function scoresToZeroHalfOne(outcome: MatchOutcome) {
  // Transform team_scores so that greater score is better
  const scores = (() => {
    if (outcome.type === OutcomeType.Ranks) {
      return outcome.team_scores.map(score => -score) // Invert scores for ranks
    }
    return outcome.team_scores
  })()

  const ranks = scoresToRanks(scores)
  const max_rank = Math.max(...ranks)
  return ranks.map(rank => {
    if (max_rank === 1) return 0.5 // All teams have the same score. Draw.
    if (rank === max_rank)
      return 1 // Winning team
    else if (rank < max_rank) return 0 // Losing team
    // Team rank should never be greater than max team rank
    throw new Error('Team rank is greater than max team rank')
  })
}
