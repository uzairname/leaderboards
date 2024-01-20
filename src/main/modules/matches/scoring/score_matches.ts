import { Match, Player, Ranking } from '../../../../database/models'
import { MatchInsert } from '../../../../database/types'
import { sentry } from '../../../../request/sentry'
import { nonNullable } from '../../../../utils/utils'
import { App } from '../../../app/app'
import { AppErrors } from '../../../app/errors'
import { default_elo_settings } from '../../rankings/manage_rankings'
import { syncGuildRankingLbMessage } from '../../rankings/ranking_channels'
import { getNewRatings } from './trueskill'

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
): Promise<Match> {
  // add match

  validateNewMatch({
    ranking_id: ranking.data.id,
    players: players,
    outcome,
    metadata,
    time_started,
  })

  const match = await app.db.matches.create({
    ranking_id: ranking.data.id,
    team_players: players,
    outcome: outcome,
    metadata: metadata,
    time_started,
    time_finished: new Date(),
  })

  sentry.captureMessage('1')

  const player_ratings_before = players.map(t =>
    t.map(p => {
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
    ranking.data.elo_settings ?? default_elo_settings,
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

  sentry.captureMessage('2')

  // update any other channels
  await app.events.MatchScored.emit(match)

  sentry.captureMessage('3')

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
    rating: number
    rd: number
  }[][],
  elo_settings: { initial_rating?: number; initial_rd?: number },
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
    elo_settings,
  )

  const result = players_before.map((t, team_num) =>
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

export async function scoreRankingHistory(
  app: App,
  ranking: Ranking,
  starting_match: Match,
  progress?: (scored: number, total: number) => void,
) {
  /*
  update all players' score based on match history
  */

  const matches = await app.db.matches.get({
    ranking_ids: [ranking.data.id],
    after: starting_match,
  })

  const elo_settings = nonNullable(ranking.data.elo_settings, 'elo settings')

  let current_player_ratings: { [key: number]: { rating: number; rd: number } } = {}

  matches.forEach(async (match, num) => {
    // get player ratings before
    const player_ratings_before = nonNullable(match.match.data.team_players, 'team_players').map(
      team =>
        team.map(player_id => {
          return {
            id: player_id,
            rating: current_player_ratings[player_id]?.rating ?? elo_settings.initial_rating,
            rd: current_player_ratings[player_id]?.rd ?? elo_settings.initial_rd,
          }
        }),
    )

    const new_player_ratings = calculateMatchNewRatings(
      match.match,
      player_ratings_before,
      elo_settings,
    )

    // update current player ratings
    new_player_ratings.flat().forEach(player => {
      current_player_ratings[player.player_id] = {
        rating: player.rating_after,
        rd: player.rd_after,
      }
    })

    progress?.(num, matches.length)
  })

  // update all players' ratings

  await Promise.all([
    Promise.all(
      Object.entries(current_player_ratings).map(async ([player_id, { rating, rd }]) => {
        await app.db.players.getPartial(+player_id).update({ rating, rd })
      }),
    ),
    Promise.all(
      (await app.db.guild_rankings.get({ ranking_id: ranking.data.id })).map(
        async guild_ranking => {
          await syncGuildRankingLbMessage(app, guild_ranking.guild_ranking)
        },
      ),
    ),
  ])
}

function validateNewMatch(data: { players: Player[][] } & Omit<MatchInsert, 'team_players'>) {
  if (data.players && data.outcome) {
    if (data.players.length !== data.outcome.length) {
      throw new AppErrors.ValidationError(`team_players and outcome length don't match`)
    }
    // make sure all players are from the same ranking, and no duplicate player ids
    if (data.players.flat().length !== new Set(data.players.flat().map(p => p.data.id)).size) {
      throw new AppErrors.ValidationError('Duplicate players in one match')
    }
    if (
      data.players.some(team => team.some(player => player.data.ranking_id !== data.ranking_id))
    ) {
      throw new AppErrors.ValidationError(
        `Some players not in the match's ranking (${data.ranking_id})`,
      )
    }
  } else {
    throw new AppErrors.ValidationError('team_players or outcome undefined')
  }
}
