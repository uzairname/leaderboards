import { Rating, TrueSkill } from 'ts-trueskill'
import { nonNullable } from '../../../../../utils/utils'
import { Match } from '../../../../database/models'
import { MatchTeamPlayer } from '../../../../database/models/matches'

export function getNewRatings(
  outcome: number[],
  players: {
    rating_before: number
    rd_before: number
  }[][],
  elo_settings: {
    initial_rating?: number
    initial_rd?: number
  },
): Rating[][] {
  const team_ranks = outcome.map(score => 1 - score)

  const env = new TrueSkill(elo_settings.initial_rating, elo_settings.initial_rd)

  const old_player_ratings = players.map(team => {
    return team.map(player => {
      return env.createRating(player.rating_before ?? undefined, player.rd_before ?? undefined)
    })
  })

  const new_player_ratings = env.rate(old_player_ratings, team_ranks)

  return new_player_ratings
}

/**
 * Returns the new ratings for each player in a match according to elo settings,
 * the players' ratings before the match, and the match outcome.
 */

export function calculateMatchNewRatings(
  match: Match,
  team_players: MatchTeamPlayer[][],
  elo_settings: { initial_rating?: number; initial_rd?: number },
): {
  new_rating: number
  new_rd: number
}[][] {
  const new_player_ratings = getNewRatings(
    nonNullable(match.data.outcome, 'match outcome'),
    team_players,
    elo_settings,
  )

  const result = team_players.map((t, team_num) =>
    t.map((before, player_num) => {
      return {
        new_rating: new_player_ratings[team_num][player_num].mu,
        new_rd: new_player_ratings[team_num][player_num].sigma,
      }
    }),
  )

  return result
}
