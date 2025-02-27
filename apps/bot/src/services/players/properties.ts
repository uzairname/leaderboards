import { Match, PartialRanking } from '@repo/db/models'
import { App } from '../../setup/app'
import { scoreMatch } from '../matches/scoring/score_match'
import { displayRatingFn } from '../rankings/properties'

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

  // Get players' display ratings and sort by them
  const players_display = players
    .map(player => ({
      user_id: player.data.user_id,
      ...displayRatingFn(app, ranking)(player.data.rating),
    }))
    .sort((a, b) => b.rating - a.rating)

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
  const display = displayRatingFn(app, ranking)

  const new_ratings = await scoreMatch({
    match: match,
    match_players: team_players,
  })

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
