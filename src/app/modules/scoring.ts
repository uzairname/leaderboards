import { Match, Ranking } from '../../database/models'
import { MatchPlayers } from '../../database/schema'
import { sentry } from '../../logging/globals'
import { assert, assertValue } from '../../utils/utils'
import { App } from '../app'
import { AppError } from '../errors'
import { Rating, TrueSkill } from 'ts-trueskill'

/**
 * Record a completed match. Update everyone's scores.
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
  const match = await app.db.matches.create({
    ranking_id: ranking.data.id,
    team_players: team_player_ids,
    outcome: outcome,
    metadata: metadata,
    time_created: time_started,
    time_finished: new Date(),
  })

  await Promise.all(
    team_player_ids.map(async (team, team_num) => {
      await Promise.all(
        team.map(async (player_id) => {
          const player = await app.db.players.getById(player_id)

          await app.db.db.insert(MatchPlayers).values({
            match_id: match.data.id,
            player_id: player_id,
            team_num,
            rating_before: player.data.rating,
            rd_before: player.data.rd,
          })
        }),
      )
    }),
  )

  await scoreOneMatch(app, match)

  // await scoreRankingHistory(ranking)
}

export async function scoreOneMatch(app: App, match: Match) {
  assertValue(match.data.team_players, 'team_players')

  const players = await Promise.all(
    match.data.team_players.map(async (team) => {
      return await Promise.all(
        team.map(async (player_id) => {
          return await app.db.players.getById(player_id)
        }),
      )
    }),
  )

  // make sure all players are from the same ranking
  const ranking_id = players[0][0].data.ranking_id

  players.forEach((team) => {
    team.forEach((player) => {
      if (player.data.ranking_id !== ranking_id) {
        throw new AppError('Players from different rankings in one match')
      }
    })
  })

  const ranking = await app.db.rankings.get(ranking_id)
  assertValue(ranking.data.elo_settings)

  assertValue(match.data.outcome, 'match outcome')
  const team_ranks = match.data.outcome.map((score) => 1 - score)

  const env = new TrueSkill(
    ranking.data.elo_settings.initial_rating,
    ranking.data.elo_settings.initial_rd,
  )

  let player_ratings = players.map((team) => {
    return team.map((player) => {
      return env.createRating(player.data.rating ?? undefined, player.data.rd ?? undefined)
    })
  })

  player_ratings = env.rate(player_ratings, team_ranks)

  // update player ratings in database
  await Promise.all(
    players.map(async (team, i) => {
      await Promise.all(
        team.map(async (player, j) => {
          await player.update({
            rating: player_ratings[i][j].mu,
            rd: player_ratings[i][j].sigma,
          })
        }),
      )
    }),
  )

  // update leaderboard messages
  await app.emitEvent('update_ranking', ranking)
}

export async function scoreRankingHistory(ranking: Ranking) {
  /*
    update all players' score based on match history
    */

  const matches = await ranking.latestMatches()

  const team_history = matches.map((match) => {
    return match.data.team_players
  })

  const outcome_history = matches.map((match) => {
    return match.data.outcome
  })
}
