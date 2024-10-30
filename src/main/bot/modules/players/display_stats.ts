import { Match, Ranking } from '../../../../database/models'
import { MatchStatus } from '../../../../database/models/matches'
import { sentry } from '../../../../logging/sentry'
import { nonNullable } from '../../../../utils/utils'
import { App } from '../../../app/App'
import { rateTrueskill } from '../matches/management/elo_calculation'
import { default_elo_settings } from '../rankings/manage_rankings'

export const calcDisplayRating =
  (app: App, initial_rating: number) => (rating: number, rd: number) =>
    Math.max(
      0,
      Math.round(
        (rating + app.config.display_sd_offset * rd) *
          (app.config.display_mean_rating / initial_rating),
      ),
    )

const isRatingProvisional = (app: App, initial_rd: number) => (rd: number) =>
  rd > initial_rd * app.config.provisional_rd_threshold

export async function getLeaderboardPlayers(
  app: App,
  ranking: Ranking,
): Promise<
  {
    user_id: string
    display_rating: number
    provisional?: boolean
  }[]
> {
  const players = await ranking.getOrderedTopPlayers()

  const elo_settings = ranking.data.elo_settings ?? default_elo_settings

  return players.map(player => ({
    user_id: player.data.user_id,
    display_rating: calcDisplayRating(app, elo_settings.initial_rating)(
      player.data.rating,
      player.data.rd,
    ),
    provisional: isRatingProvisional(app, elo_settings.initial_rd)(player.data.rd),
  }))
}

export async function getMatchPlayersDisplayStats(
  app: App,
  match: Match,
): Promise<
  {
    user_id: string
    rating_before: number
    rating_after?: number
    provisional_before: boolean
    provisional_after?: boolean
  }[][]
> {
  const ranking = await match.ranking()
  const team_players = await match.teamPlayers()

  const elo_settings = ranking.data.elo_settings ?? default_elo_settings

  sentry.debug(
    `team_players: ${team_players.length}, ${team_players[0].length}, ${team_players[1].length}`,
  )

  const new_ratings =
    match.data.status === MatchStatus.Finished
      ? rateTrueskill(
          nonNullable(match.data.outcome, 'match.outcome'),
          team_players,
          ranking.data.elo_settings ?? default_elo_settings,
          match.data.metadata?.best_of,
        )
      : undefined

  const display = calcDisplayRating(app, elo_settings.initial_rating)
  const provisional = isRatingProvisional(app, elo_settings.initial_rd)

  const result = team_players.map((team, team_num) =>
    team.map((player, player_num) => {
      return {
        user_id: player.player.data.user_id,
        rating_before: display(player.rating_before, player.rd_before),
        rating_after: new_ratings
          ? display(
              new_ratings[team_num][player_num].new_rating,
              new_ratings[team_num][player_num].new_rd,
            )
          : undefined,
        provisional_before: provisional(player.rd_before),
        provisional_after: new_ratings
          ? provisional(new_ratings[team_num][player_num].new_rd)
          : undefined,
      }
    }),
  )

  return result
}
