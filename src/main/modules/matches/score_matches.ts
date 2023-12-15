import { Match, Player, Ranking } from '../../../database/models'
import { MatchPlayerSelect } from '../../../database/models/types'
import { nonNullable } from '../../../utils/utils'
import { App } from '../../app/app'
import { getNewRatings } from './scoring'

/**
 * Record a completed match. create a new Match. Update everyone's scores.
 * @param team_player_ids list of player ids for each team
 * @param outcome relative team scores
 */
export async function recordAndScoreNewMatch(
  app: App,
  ranking: Ranking,
  players: Player[][],
  outcome: number[],
  time_started: Date = new Date(),
  metadata?: { [key: string]: any },
) {
  // add match
  const match = await app.db.matches.create({
    ranking_id: ranking.data.id,
    team_players: players,
    outcome: outcome,
    metadata: metadata,
    time_started,
    time_finished: new Date(),
  })

  const player_ratings_before = players.map((t) =>
    t.map((p) => {
      return {
        rating: nonNullable(p.data.rating, 'rating'),
        rd: nonNullable(p.data.rd, 'rd'),
      }
    }),
  )

  // calculate new player ratings
  const new_player_ratings = getNewRatings(
    nonNullable(match.data.outcome, 'match outcome'),
    player_ratings_before,
    nonNullable(ranking.data.elo_settings, 'elo settings'),
  )

  // update player ratings in database
  await Promise.all(
    players.map(async (team, i) => {
      await Promise.all(
        team.map(async (player, j) => {
          await player.update({
            rating: new_player_ratings[i][j].mu,
            rd: new_player_ratings[i][j].sigma,
          })
        }),
      )
    }),
  )

  // update any other channels
  await app.events.MatchScored.emit(match)
}

export async function getAndCalculateMatchNewRatings(match: Match, ranking: Ranking) {
  const players = await match.players()

  const player_ratings_before = players.map((t) =>
    t.map((p) => {
      return {
        id: p.player.data.id,
        rating: nonNullable(p.match_player.rating_before, 'rating before'),
        rd: nonNullable(p.match_player.rd_before, 'rd before'),
      }
    }),
  )
  return calculateMatchNewRatings(
    match,
    player_ratings_before,
    nonNullable(ranking.data.elo_settings),
  )
}

export function calculateMatchNewRatings(
  match: Match,
  players_before: {
    id: number
    rating: number
    rd: number
  }[][],
  elo_settings?: { initial_rating?: number; initial_rd?: number },
): {
  player_id: number
  rating_before: number
  rd_before: number
  rating_after: number
  rd_after: number
}[][] {
  const new_player_ratings = getNewRatings(
    nonNullable(match.data.outcome, 'match outcome'),
    players_before,
    nonNullable(elo_settings),
  )

  const result: Awaited<ReturnType<typeof calculateMatchNewRatings>> = players_before.map(
    (t, team_num) =>
      t.map((before, player_num) => {
        return {
          player_id: before.id,
          rating_before: before.rating,
          rd_before: before.rd,
          rating_after: new_player_ratings[team_num][player_num].mu,
          rd_after: new_player_ratings[team_num][player_num].sigma,
        }
      }),
  )

  return result
}

export async function scoreRankingHistory(app: App, ranking: Ranking) {
  /*
  update all players' score based on match history
  */

  const matches = await ranking.latestMatches()
  const elo_settings = nonNullable(ranking.data.elo_settings, 'elo settings')

  let current_player_ratings: { [key: number]: { rating: number; rd: number } } = {}

  matches.forEach(async (match) => {
    // get player ratings before
    const player_ratings_before = nonNullable(match.data.team_players, 'team_players').map((team) =>
      team.map((player_id) => {
        return {
          id: player_id,
          rating: current_player_ratings[player_id]?.rating ?? elo_settings.initial_rating,
          rd: current_player_ratings[player_id]?.rd ?? elo_settings.initial_rd,
        }
      }),
    )
    await match.update({ team_players_before: player_ratings_before })

    const new_player_ratings = calculateMatchNewRatings(match, player_ratings_before, elo_settings)

    // update current player ratings
    new_player_ratings.flat().forEach((player) => {
      current_player_ratings[player.player_id] = {
        rating: player.rating_after,
        rd: player.rd_after,
      }
    })
  })

  // update all players' ratings

  await Promise.all(
    Object.entries(current_player_ratings).map(async ([player_id, rating]) => {
      // await app.db.players.
    }),
  )

  await app.events.RankingUpdated.emit(ranking)
}
