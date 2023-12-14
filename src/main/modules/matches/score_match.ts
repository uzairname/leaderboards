import { Player, Ranking } from '../../../database/models'
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
  team_players: Player[][],
  outcome: number[],
  time_started: Date = new Date(),
  metadata?: { [key: string]: any },
) {
  // add match
  const match = await app.db.matches.create({
    ranking_id: ranking.data.id,
    team_players: team_players,
    outcome: outcome,
    metadata: metadata,
    time_started,
    time_finished: new Date(),
  })

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
  await app.events.MatchScored.emit(match)
}
