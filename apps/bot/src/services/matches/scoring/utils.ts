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
export function scoresToZeroHalfOne(outcome: MatchOutcome): (0 | 0.5 | 1)[] {
  // Transform team_scores so that greater score is better
  const scores = (() => {
    if (outcome.type === OutcomeType.Ranks) {
      return outcome.team_scores.map(score => -score) // Invert scores for ranks
    }
    return outcome.team_scores
  })()

  const ranks = scoresToRanks(scores)
  const best_rank = Math.min(...ranks)
  const worst_rank = Math.max(...ranks)

  // If all teams have the same score, it's a draw
  if (best_rank === worst_rank) {
    return ranks.map(() => 0.5)
  }

  // Otherwise, assign 1 to winning teams and 0 to losing teams
  return ranks.map(rank => {
    if (rank === best_rank) return 1
    return 0
  })
}
