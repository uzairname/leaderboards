import { MatchOutcome, MatchPlayer, OutcomeType, Rating, RatingParameters } from '@repo/db/models'
import { TrueSkill, Rating as TsRating } from 'ts-trueskill'
import { App } from '../../../../setup/app'
import { TRUESKILL_DEFAULT } from '../../../rankings/ratings'
import { Scorer } from '../scorer'
import { scoresToRanks } from '../utils'

const TRUESKILL_INTERNAL = {
  MU: 50,
  RD: 50 / 3,
}

export const TrueSkillScorer: Scorer = {
  score(param: {
    app: App
    outcome: MatchOutcome
    players: MatchPlayer[][]
    time_since_last_match?: number[][]
    best_of?: number
    rating_settings: RatingParameters
  }): Rating[][] {
    const { outcome, players, best_of = 1, rating_settings: rs } = param

    const team_ranks = (() => {
      if (outcome.type === OutcomeType.WinLossDraw || outcome.type === OutcomeType.Points) {
        return scoresToRanks(outcome.team_scores)
      } else if (outcome.type === OutcomeType.Ranks) {
        return outcome.team_scores
      } else {
        throw new Error(`Unsupported outcome type ${outcome.type} for TrueSkill scorer`)
      }
    })()

    param.app.logger.debug(`team scores ${outcome.team_scores}, ranks ${team_ranks}`)

    // The internally used ratio between mu and sigma should match that of rating settings.mu and rd
    const sigma = (TRUESKILL_INTERNAL.MU * rs.initial_rating.rd) / rs.initial_rating.mu
    const env = new TrueSkill(rs.initial_rating.mu, sigma)
    env.tau = rs.tau ?? TRUESKILL_DEFAULT.Tau

    // Higher beta = more assumed volatility and slower convergence
    // Multiply to increase assumed volatility
    // Divide by term related to best_of to reduce the uncertainty for longer series
    env.beta = (3 * env.beta) / Math.sqrt(best_of)

    const old_player_ratings = players.map(team => {
      return team.map(player => {
        return env.createRating(player.rating.mu ?? undefined, player.rating.rd ?? undefined)
      })
    })

    const new_player_ratings: TsRating[][] = env.rate(old_player_ratings, team_ranks)

    return new_player_ratings.map((team, i) => {
      return team.map((player, i) => {
        return {
          mu: player.mu,
          rd: player.sigma,
          vol: players[i][i].rating.vol,
        }
      })
    })
  },

  isSupported(outcome_type: OutcomeType, players_per_team: number, teams_per_match: number) {
    // TrueSkill supports any number of teams and players per team
    return { is_supported: true }
  },
}
