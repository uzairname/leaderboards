import { Match } from 'database/models'
import { MatchStatus } from 'database/models/matches'
import { PartialRanking, Rating } from 'database/models/rankings'
import { nonNullable } from 'utils'
import { App } from '../../setup/app'
import { Scorer } from '../matches/management/rating-calculation'

export const calcDisplayRating = (app: App, initial_rating: Rating) => (rating: Rating) => {
  return {
    rating: Math.max(
      0,
      Math.round(
        // rating.mu
        (rating.mu + app.config.DisplaySdOffset * rating.rd) *
          (app.config.DisplayMeanRating / initial_rating.mu),
      ),
    ),
    is_provisional: rating.rd > initial_rating.rd * app.config.ProvisionalRdThreshold,
  }
}

export async function getOrderedLeaderboardPlayers(
  app: App,
  _ranking: PartialRanking,
): Promise<
  {
    user_id: string
    rating: number
    is_provisional?: boolean
  }[]
> {
  const ranking = await _ranking.fetch()
  const players = await app.db.players.fetchMany({ ranking_id: ranking.data.id })

  const initial_rating = ranking.data.initial_rating

  // Get players' display ratings and sort by them
  const players_display = players
    .map(player => ({
      user_id: player.data.user_id,
      ...calcDisplayRating(app, initial_rating)(player.data.rating),
    }))
    .sort((a, b) => b.rating - a.rating)

  return players_display
}

export async function getMatchPlayersDisplayStats(
  app: App,
  match: Match,
  scorer: Scorer = app.config.defaultScorer,
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
  const display = calcDisplayRating(app, initial_rating)

  const new_ratings =
    match.data.status === MatchStatus.Finished
      ? scorer(
          nonNullable(match.data.outcome, 'match.outcome'),
          team_players,
          ranking.data.initial_rating,
          match.data.metadata?.best_of,
        )
      : undefined

  const result = team_players.map((team, i) =>
    team.map((match_player, j) => {
      return {
        user_id: match_player.player.data.user_id,
        before: display(match_player.rating),
        after: new_ratings ? display(new_ratings[i][j]) : undefined,
      }
    }),
  )

  return result
}
