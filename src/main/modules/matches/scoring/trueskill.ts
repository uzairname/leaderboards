import { Rating, TrueSkill } from 'ts-trueskill'

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

  let player_ratings = players.map(team => {
    return team.map(player => {
      return env.createRating(player.rating_before ?? undefined, player.rd_before ?? undefined)
    })
  })

  player_ratings = env.rate(player_ratings, team_ranks)

  return player_ratings
}
