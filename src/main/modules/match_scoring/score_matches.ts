import { Match, Player, Ranking } from '../../../../database/models'
import { MatchInsert } from '../../../../database/types'
import { sentry } from '../../../../request/logging'
import { nonNullable } from '../../../../utils/utils'
import { App } from '../../../app-context/app-context'
import { AppErrors } from '../../../errors'
import {
  syncGuildRankingLbMessage,
  syncRankingLbMessages,
} from '../../leaderboard/leaderboard_messages'
import { updatePlayerRating } from '../../players'
import { default_elo_settings } from '../../rankings/manage_rankings'
import { validateMatch } from '../manage_matches'
import { getNewRatings } from './trueskill'

/**
 * Validates and records a new match from players, outcome, and metadata. Updates players' scores.
 * @param team_player_ids list of player ids for each team
 * @param outcome relative team scores
 */
export async function recordAndScoreNewMatch(
  app: App,
  ranking: Ranking,
  players: Player[][],
  outcome: number[],
  time_started?: Date,
  time_finished?: Date,
  metadata?: { [key: string]: any },
): Promise<Match> {
  // add match

  validateMatch({
    ranking_id: ranking.data.id,
    players: players,
    outcome,
    metadata,
    time_started,
    time_finished,
  })

  const match = await app.db.matches.create({
    ranking_id: ranking.data.id,
    team_players: players,
    outcome: outcome,
    metadata: metadata,
    time_started: time_started ?? time_finished ?? new Date(),
    time_finished: time_finished ?? time_started ?? new Date(),
  })

  const player_ratings_before = players.map(t =>
    t.map(p => {
      return {
        id: p.data.id,
        rating_before: nonNullable(p.data.rating, 'rating'),
        rd_before: nonNullable(p.data.rd, 'rd'),
      }
    }),
  )

  // calculate new player ratings
  const new_player_ratings = calculateMatchNewRatings(
    match,
    player_ratings_before,
    ranking.data.elo_settings ?? default_elo_settings,
  )

  // update player ratings in database
  await Promise.all(
    players.map(async (team, i) => {
      await Promise.all(
        team.map(async (player, j) =>
          updatePlayerRating(
            app,
            player,
            new_player_ratings[i][j].rating_after,
            new_player_ratings[i][j].rd_after,
          ),
        ),
      )
    }),
  )

  // update any other channels
  await app.events.MatchCreatedOrUpdated.emit(match)

  return match
}

/**
 * Returns the new ratings for each player in a match according to elo settings,
 * the players' ratings before the match, and the match outcome.
 */
export function calculateMatchNewRatings(
  match: Match,
  players_before: {
    id: number
    rating_before: number
    rd_before: number
  }[][],
  elo_settings: { initial_rating?: number; initial_rd?: number },
): {
  player_id: number
  rating_after: number
  rd_after: number
}[][] {
  const new_player_ratings = getNewRatings(
    nonNullable(match.data.outcome, 'match outcome'),
    players_before,
    elo_settings,
  )

  const result = players_before.map((t, team_num) =>
    t.map((before, player_num) => {
      return {
        player_id: before.id,
        rating_after: new_player_ratings[team_num][player_num].mu,
        rd_after: new_player_ratings[team_num][player_num].sigma,
      }
    }),
  )

  return result
}

export async function scoreRankingHistory(
  app: App,
  ranking: Ranking,
  on_or_after?: Date,
  affected_player_ratings: { [key: number]: { rating: number; rd: number } } = {},
) {
  /*
  update all players' score based on match history
  */

  sentry.debug('ranking history')

  const matches = await app.db.matches.getMany({
    ranking_ids: [ranking.data.id],
    on_or_after,
  })

  sentry.debug('scoring this many matches', matches.length)

  for (const match of matches) {
    // get player ratings before
    let player_ratings_before_changed: boolean = false
    const player_ratings_before = nonNullable(match.teams, 'team_players').map(team =>
      team.map(current_player => {
        const player_id = current_player.player.data.id
        // Check if the player ratings before have changed
        sentry.debug(
          current_player.match_player.rating_before,
          affected_player_ratings[player_id]?.rating,
        )
        if (
          affected_player_ratings[player_id] !== undefined &&
          (current_player.match_player.rating_before !==
            affected_player_ratings[player_id].rating ||
            current_player.match_player.rd_before !== affected_player_ratings[player_id].rd)
        ) {
          player_ratings_before_changed = true
        }

        return {
          id: player_id,
          rating_before:
            affected_player_ratings[player_id]?.rating ?? current_player.match_player.rating_before,
          rd_before:
            affected_player_ratings[player_id]?.rd ?? current_player.match_player.rd_before,
        }
      }),
    )

    if (player_ratings_before_changed) {
      // update match players' ratings and rd before
      await match.match.updateMatchPlayers(
        player_ratings_before.map(team =>
          team.map(player => {
            return {
              id: player.id,
              rating_before: player.rating_before,
              rd_before: player.rd_before,
            }
          }),
        ),
      )
    }

    const new_player_ratings = calculateMatchNewRatings(
      match.match,
      player_ratings_before,
      nonNullable(ranking.data.elo_settings, 'elo settings'),
    )

    // update current player ratings
    new_player_ratings.flat().forEach(player => {
      affected_player_ratings[player.player_id] = {
        rating: player.rating_after,
        rd: player.rd_after,
      }
    })

    sentry.debug('affected player ratings: ', JSON.stringify(affected_player_ratings))
  }

  const res = await Promise.all([
    // update all players' ratings
    Promise.all(
      Object.entries(affected_player_ratings).map(async ([player_id, { rating, rd }]) => {
        sentry.debug(`updating player ${player_id} rating to ${rating}`)
        const player = app.db.players.getPartial(+player_id)
        sentry.debug(`player: ${player.data.id}`)
        await updatePlayerRating(app, player, rating, rd)
      }),
    ),
    // update leaderboard messages
    syncRankingLbMessages(app, ranking),
  ])

  sentry.debug('result', res)
}
