import { Match, Ranking } from '../../../../database/models'
import { MatchStatus } from '../../../../database/models/matches'
import { EloSettings } from '../../../../database/models/rankings'
import { nonNullable } from '../../../../utils/utils'
import { App } from '../../../app/App'
import { rateTrueskill } from '../matches/management/elo-calculation'

export const calcDisplayRating =
  (app: App, elo_settings: EloSettings) => (data: { rating: number; rd: number }) => ({
    score: Math.max(
      0,
      Math.round(
        (data.rating + app.config.DisplaySdOffset * data.rd) *
          (app.config.DisplayMeanRating / elo_settings.prior_mu),
      ),
    ),
    is_provisional: data.rd > elo_settings.prior_rd * app.config.ProvisionalRdThreshold,
  })

export async function getLeaderboardPlayers(
  app: App,
  ranking: Ranking,
): Promise<
  {
    user_id: string
    score: number
    is_provisional?: boolean
  }[]
> {
  const players = await ranking.getOrderedTopPlayers()

  const elo_settings = ranking.data.elo_settings

  return players.map(player => ({
    user_id: player.data.user_id,
    ...calcDisplayRating(app, elo_settings)(player.data),
  }))
}

export async function getMatchPlayersDisplayStats(
  app: App,
  match: Match,
): Promise<
  {
    user_id: string
    before: { score: number; is_provisional?: boolean }
    after?: { score: number; is_provisional?: boolean }
  }[][]
> {
  const ranking = await match.ranking()
  const team_players = await match.teamPlayers()

  const elo_settings = ranking.data.elo_settings

  const new_ratings =
    match.data.status === MatchStatus.Scored
      ? rateTrueskill(
          nonNullable(match.data.outcome, 'match.outcome'),
          team_players,
          ranking.data.elo_settings,
          match.data.metadata?.best_of,
        )
      : undefined

  const display = calcDisplayRating(app, elo_settings)

  const result = team_players.map((team, i) =>
    team.map((match_player, j) => {
      const before = display({ rating: match_player.rating_before, rd: match_player.rd_before })
      const after = new_ratings
        ? display({ rating: new_ratings[i][j].new_rating, rd: new_ratings[i][j].new_rd })
        : undefined

      return {
        user_id: match_player.player.data.user_id,
        before,
        after,
      }
    }),
  )

  return result
}
