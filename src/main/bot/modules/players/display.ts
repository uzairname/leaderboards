import { Match, Ranking } from '../../../../database/models'
import { MatchStatus } from '../../../../database/models/matches'
import { Rating } from '../../../../database/models/rankings'
import { nonNullable } from '../../../../utils/utils'
import { App } from '../../../app/App'
import { rateTrueskill } from '../matches/management/rating-calculation'

export const calcDisplayRating = (app: App, initial_rating: Rating) => (rating: Rating) => ({
  rating: Math.max(
    0,
    Math.round(
      (rating.mu + app.config.DisplaySdOffset * rating.rd) *
        (app.config.DisplayMeanRating / initial_rating.mu),
    ),
  ),
  is_provisional: rating.rd > initial_rating.rd * app.config.ProvisionalRdThreshold,
})

export async function getOrderedLeaderboardPlayers(
  app: App,
  ranking: Ranking,
): Promise<
  {
    user_id: string
    rating: number
    is_provisional?: boolean
  }[]
> {
  const players = await ranking.players()

  const initial_rating = ranking.data.initial_rating

  const players_display = players.map(player => ({
    user_id: player.data.user_id,
    ...calcDisplayRating(app, initial_rating)(player.data.rating),
  }))

  // sort by display score
  players_display.sort((a, b) => b.rating - a.rating)

  return players_display
}

export async function getMatchPlayersDisplayStats(
  app: App,
  match: Match,
): Promise<
  {
    user_id: string
    before: { rating: number; is_provisional?: boolean }
    after?: { rating: number; is_provisional?: boolean }
  }[][]
> {
  const ranking = await match.ranking.fetch()
  const team_players = await match.players()

  const initial_rating = ranking.data.initial_rating

  const new_ratings =
    match.data.status === MatchStatus.Finished
      ? rateTrueskill(
          nonNullable(match.data.outcome, 'match.outcome'),
          team_players,
          ranking.data.initial_rating,
          match.data.metadata?.best_of,
        )
      : undefined

  const display = calcDisplayRating(app, initial_rating)

  const result = team_players.map((team, i) =>
    team.map((match_player, j) => {
      const before = display(match_player.rating)
      const after = new_ratings ? display(new_ratings[i][j]) : undefined

      return {
        user_id: match_player.player.data.user_id,
        before,
        after,
      }
    }),
  )

  return result
}
