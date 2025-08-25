import { MatchOutcome, MatchPlayer, OutcomeType } from '../../../../../../../packages/db/src/models/matches'
import { Rating, RatingParameters } from '../../../../../../../packages/db/src/models/rankings'
import { App } from '../../../../setup/app'
import { GLICKO_DEFAULT } from '../../../rankings/ratings'
import { calculateNewGlickoRatings } from '../calculations/glicko2'
import { Scorer } from '../scorer'
import { scoresToZeroHalfOne } from '../utils'

export const GlickoScorer: Scorer = {
  score(params: {
    app: App
    outcome: MatchOutcome
    players: MatchPlayer[][]
    time_since_last_match?: number[][]
    best_of?: number
    rating_settings: RatingParameters
  }): Rating[][] {
    const { app, outcome, players, time_since_last_match, rating_settings } = params

    /**
     * Glicko only supports 1v1 matches
     */
    if (players.length !== 2 || players[0].length !== 1 || players[1].length !== 1) {
      throw new Error('Glicko2 scorer supports only 1v1 matches')
    }

    const normalized_team_scores = scoresToZeroHalfOne(outcome)

    // Determine number of rating periods since last match for both players
    const p1_inactive_periods = (time_since_last_match?.[0][0] || 0) / (7 * 24 * 60 * 60)
    const p2_inactive_periods = (time_since_last_match?.[1][0] || 0) / (7 * 24 * 60 * 60)

    const new_ratings = calculateNewGlickoRatings(
      {
        rating: players[0][0].rating.mu,
        rd: players[0][0].rating.rd ?? rating_settings.initial_rating.rd,
        vol: players[0][0].rating.vol ?? rating_settings.initial_rating.vol,
      },
      {
        rating: players[1][0].rating.mu,
        rd: players[1][0].rating.rd ?? rating_settings.initial_rating.rd,
        vol: players[1][0].rating.vol ?? rating_settings.initial_rating.vol,
      },
      // Result of the match from player 1's perspective
      normalized_team_scores[0],
      p1_inactive_periods,
      p2_inactive_periods,
      {
        tau: rating_settings.tau ?? GLICKO_DEFAULT.Tau,
        glicko_scale: GLICKO_SCALE,
        default_rating: rating_settings.initial_rating.mu,
      },
    )

    return [
      [
        {
          mu: new_ratings.player1.rating,
          rd: new_ratings.player1.rd,
          vol: new_ratings.player1.vol,
        },
      ],
      [
        {
          mu: new_ratings.player2.rating,
          rd: new_ratings.player2.rd,
          vol: new_ratings.player2.vol,
        },
      ],
    ]
  },

  isSupported(outcome_type: OutcomeType, players_per_team: number, teams_per_match: number) {
    // Glicko supports only 1v1 matches
    if (!(players_per_team === 1 && teams_per_match === 2)) {
      return {
        is_supported: false,
        message: `Glicko scorer only supports 1v1 matches, got ${players_per_team}v${teams_per_match}`,
      }
    }
    return { is_supported: true }
  },
}

const GLICKO_SCALE = 173.7178
