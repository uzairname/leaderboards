import { MatchOutcome, MatchPlayer, OutcomeType, Rating, RatingParameters } from '@repo/db/models'
import { App } from '../../../../setup/app'
import { Scorer } from '../scorer'

export const WinsMinusLossesScorer: Scorer = {
  /**
   * Simple scorer that just adds 1 to the winning team and subtracts 1 from the losing team
   * If draw, no change is made
   * If used for a ranking, a player's total rating = wins - losses
   */
  score(params: {
    app: App
    outcome: MatchOutcome
    players: MatchPlayer[][]
    time_since_last_match?: number[][]
    best_of?: number
    rating_settings: RatingParameters
  }): Rating[][] {
    const { app, outcome, players } = params

    const { winning_team_indices, is_draw } = app.matches.getOutcomeWinners(outcome)
    if (is_draw) return players.map(team => team.map(player => player.rating))

    return players.map((team, i) => {
      return team.map(player => {
        return {
          ...player.rating,
          // Add 1 for winning team, subtract 1 for losing team
          mu: player.rating.mu + (winning_team_indices.includes(i) ? 1 : -1),
        }
      })
    })
  },

  isSupported(outcome_type: OutcomeType, players_per_team: number, teams_per_match: number) {
    return { is_supported: true }
  },
}
