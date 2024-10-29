import { Match, Ranking } from '../../../../database/models'
import { MatchStatus } from '../../../../database/models/matches'
import { nonNullable } from '../../../../utils/utils'
import { rateTrueskill } from '../matches/management/elo_calculation'
import { default_elo_settings } from '../rankings/manage_rankings'

const display_mean_rating = 1000
const display_sd_offset = -0.6

export const calcDisplayRating = (initial_rating: number) => (rating: number, rd: number) =>
  Math.max(
    0,
    Math.round((rating + display_sd_offset * rd) * (display_mean_rating / initial_rating)),
  )

const isRatingProvisional = (initial_rd: number) => (rd: number) => rd > initial_rd * 0.9

export async function getLeaderboardPlayers(ranking: Ranking): Promise<
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
    display_rating: calcDisplayRating(elo_settings.initial_rating)(
      player.data.rating,
      player.data.rd,
    ),
    provisional: isRatingProvisional(elo_settings.initial_rd)(player.data.rd),
  }))
}

export async function getMatchPlayersDisplayStats(match: Match): Promise<
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

  const new_ratings =
    match.data.status === MatchStatus.Finished
      ? rateTrueskill(
          nonNullable(match.data.outcome, 'match.outcome'),
          team_players,
          ranking.data.elo_settings ?? default_elo_settings,
          match.data.metadata?.best_of,
        )
      : undefined

  const display = calcDisplayRating(elo_settings.initial_rating)
  const provisional = isRatingProvisional(elo_settings.initial_rd)

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
