import { Ranking } from '../../database/models'
import { default_elo_settings } from '../../database/models/models/rankings'
import { MatchPlayers } from '../../database/schema'
import { assertValue } from '../../utils/utils'
import { App } from '../app/app'
import { AppError } from '../app/errors'
import { events } from '../app/events'
import { scoreMatch } from './scoring'

/**
 * Record a completed match. create a new Match. Update everyone's scores.
 * @param team_player_ids list of player ids for each team
 * @param outcome relative team scores
 */
export async function finishMatch(
  app: App,
  ranking: Ranking,
  team_player_ids: number[][],
  outcome: number[],
  time_started: Date = new Date(),
  metadata?: { [key: string]: any },
) {
  const players = await Promise.all(
    team_player_ids.map(async (team) => {
      return await Promise.all(
        team.map(async (player_id) => {
          return await app.db.players.getById(player_id)
        }),
      )
    }),
  )

  // make sure all players are from the same ranking, and no duplicate player ids
  const ranking_id = players[0][0].data.ranking_id
  if (players.flat().length !== new Set(players.flat().map((p) => p.data.id)).size) {
    throw new AppError('Duplicate players in one match')
  }
  players.forEach((team) => {
    team.forEach((player) => {
      if (player.data.ranking_id !== ranking_id) {
        throw new AppError('Players from different rankings in one match')
      }
    })
  })

  // add match
  const match = await app.db.matches.create({
    ranking_id: ranking.data.id,
    team_players: team_player_ids,
    outcome: outcome,
    metadata: metadata,
    time_started,
    time_finished: new Date(),
  })

  // add match players
  await Promise.all(
    players.map(async (team, team_num) => {
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
  assertValue(match.data.outcome, 'match outcome')
  const new_player_ratings = scoreMatch(
    match.data.outcome,
    players.map((t) =>
      t.map((p) => {
        return {
          rating: p.data.rating || default_elo_settings.initial_rating,
          rd: p.data.rd || default_elo_settings.initial_rd,
        }
      }),
    ),
    ranking,
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
  await app.emitEvent(events.MatchFinished, match, players)
}
