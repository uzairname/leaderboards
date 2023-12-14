import { Player, Ranking } from '../../../database/models'
import { default_elo_settings } from '../../../database/models/models/rankings'
import { MatchPlayers } from '../../../database/schema'
import { sentry } from '../../../request/sentry'
import { nonNullable } from '../../../utils/utils'
import { App } from '../../app/app'
import { AppError } from '../../app/errors'
import { events } from '../../app/events'
import { getNewRatings } from './scoring'

/**
 * Record a completed match. create a new Match. Update everyone's scores.
 * @param team_player_ids list of player ids for each team
 * @param outcome relative team scores
 */
export async function recordAndScoreNewMatch(
  app: App,
  ranking: Ranking,
  team_players: Player[][],
  outcome: number[],
  time_started: Date = new Date(),
  metadata?: { [key: string]: any },
) {
  // make sure all players are from the same ranking, and no duplicate player ids
  const ranking_id = team_players[0][0].data.ranking_id
  if (team_players.flat().length !== new Set(team_players.flat().map((p) => p.data.id)).size) {
    throw new AppError('Duplicate players in one match')
  }
  team_players.forEach((team) => {
    team.forEach((player) => {
      if (player.data.ranking_id !== ranking_id) {
        throw new AppError('Players from different rankings in one match')
      }
    })
  })

  // add match
  const match = await app.db.matches.create({
    ranking_id: ranking.data.id,
    team_players: team_players.map((team) => team.map((player) => player.data.id)),
    outcome: outcome,
    metadata: metadata,
    time_started,
    time_finished: new Date(),
  })

  // add match players
  await Promise.all(
    team_players.map(async (team, team_num) => {
      await Promise.all(
        team.map(async (player) => {
          await app.db.db.insert(MatchPlayers).values({
            match_id: match.data.id,
            player_id: player.data.id,
            team_num,
            rating_before: player.data.rating,
            rd_before: player.data.rd,
          })
        }),
      )
    }),
  )

  // calculate new player ratings
  const new_player_ratings = getNewRatings(
    nonNullable(match.data.outcome, 'match outcome'),
    team_players.map((t) =>
      t.map((p) => {
        return {
          rating: nonNullable(p.data.rating, 'rating'),
          rd: nonNullable(p.data.rd, 'rd'),
        }
      }),
    ),
    nonNullable(ranking.data.elo_settings),
  )

  // update player ratings in database
  await Promise.all(
    team_players.map(async (team, i) => {
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
  sentry.debug('emitting MatchScored event')
  await app.events.MatchScored.emit(match)
}
