import { MatchOutcome, MatchPlayer, OutcomeType, Rating, RatingParameters, RatingStrategy } from '@repo/db/models'
import { BayesianScorer, EloScorer, GlickoScorer, TrueSkillScorer, WinsMinusLossesScorer } from '.'
import { App } from '../../../setup/app'

export type ScorerFn = (params: {
  app: App
  outcome: MatchOutcome
  players: MatchPlayer[][]
  time_since_last_match?: number[][]
  best_of?: number
  rating_settings: RatingParameters
}) => Rating[][]

export interface Scorer {
  /**
   * Function that calculates the new ratings of players after a match
   * @param outcome MatchOutcome
   * @param match_players_before contains the ratings of the players before the match
   * @returns 2d array of team player ratings, contains the ratings of the players after the match
   */
  score: ScorerFn

  /**
   * Checks if the scorer supports the given outcome type and match configuration
   */
  isSupported(
    outcome_type: OutcomeType,
    players_per_team: number,
    teams_per_match: number,
  ): { is_supported: boolean; message?: string }
}

export const rating_strategies: RatingStrategy[] = [
  RatingStrategy.TrueSkill,
  RatingStrategy.WinsMinusLosses,
  RatingStrategy.Elo,
  RatingStrategy.Glicko,
  RatingStrategy.Bayesian,
]

export function ratingStrategyToScorer(type: RatingStrategy): Scorer {
  const scorer = {
    [RatingStrategy.TrueSkill]: TrueSkillScorer,
    [RatingStrategy.WinsMinusLosses]: WinsMinusLossesScorer,
    [RatingStrategy.Elo]: EloScorer,
    [RatingStrategy.Glicko]: GlickoScorer,
    [RatingStrategy.Bayesian]: BayesianScorer,
  }[type]
  if (!scorer) throw new Error(`Unknown rating strategy ${type}`)
  return scorer
}
