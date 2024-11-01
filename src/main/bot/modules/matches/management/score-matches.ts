import { Match, Ranking } from '../../../../../database/models'
import { MatchStatus, MatchPlayer } from '../../../../../database/models/matches'
import { sentry } from '../../../../../logging/sentry'
import { nonNullable } from '../../../../../utils/utils'
import { App } from '../../../../app/App'
import { syncRankingLbMessages } from '../../leaderboard/leaderboard-message'
import { updatePlayerRating } from '../../players/manage-players'
import { syncMatchSummaryMessages } from '../logging/match-summary-message'
import { rateTrueskill } from './elo-calculation'

export async function finishAndScoreMatch(
  app: App,
  match: Match,
  outcome: number[],
): Promise<Match> {
  if (match.data.status === MatchStatus.Scored) return match

  const ranking = await match.ranking()
  const team_players = await match.teamPlayers()
  
  await match.update({
    status: MatchStatus.Scored,
    time_finished: new Date(),
    outcome,
  })
  
  const scored_match = await scoreMatch(app, match, team_players, ranking)

  return scored_match
}

export async function scoreMatch(
  app: App,
  match: Match,
  team_players: MatchPlayer[][],
  ranking: Ranking,
): Promise<Match> {
  // calculate new player ratings
  const outcome = nonNullable(match.data.outcome, 'match.outcome')
  const new_player_ratings = rateTrueskill(
    outcome,
    team_players,
    ranking.data.elo_settings,
    match.data.metadata?.best_of,
  )

  // update player ratings in database
  await Promise.all(
    team_players.map(async (team, i) => {
      await Promise.all(
        team.map(async (player, j) =>
          updatePlayerRating(
            app,
            player.player,
            new_player_ratings[i][j].new_rating,
            new_player_ratings[i][j].new_rd,
          ),
        ),
      )
    }),
  )

  await syncRankingLbMessages(app, ranking)
  await syncMatchSummaryMessages(app, match)

  return match
}


export async function rescoreMatches(
  app: App,
  ranking: Ranking,
  finished_on_or_after?: Date,
  _affected_player_ratings: Readonly<{ [key: number]: { rating: number; rd: number } }> = {},
) {
  let affected_player_ratings = {..._affected_player_ratings} // clone the object

  const matches = await app.db.matches.getMany({
    ranking_ids: [ranking.data.id],
    finished_at_or_after: finished_on_or_after,
    status: MatchStatus.Scored,
  })

  sentry.debug(`rescoreMatches(${ranking}, on_or_after ${finished_on_or_after}). rescoring ${matches.length} matches`)

  const recalculated_match_players: {match_id: number, player: MatchPlayer}[] = []

  for (const match of matches) {
    // get player ratings before
    if (!match.match.data.outcome) continue
    let player_ratings_before_changed: boolean = false

    const player_ratings_before = match.team_players.map(team =>
      team.map(current_player => {
        const player_id = current_player.player.data.id
        // Check if the player ratings before have changed
        if (
          affected_player_ratings[player_id] !== undefined &&
          (current_player.rating_before !== affected_player_ratings[player_id].rating ||
            current_player.rd_before !== affected_player_ratings[player_id].rd)
        ) {
          player_ratings_before_changed = true
          recalculated_match_players.push({match_id: match.match.data.id, player: current_player})
        }

        return {
          ...current_player,
          rating_before: affected_player_ratings[player_id]?.rating ?? current_player.rating_before,
          rd_before: affected_player_ratings[player_id]?.rd ?? current_player.rd_before,
        }
      }),
    )

    // if (player_ratings_before_changed) {
    //   // update match players' ratings and rd before
    //   await match.match.updatePlayerRatingsBefore(player_ratings_before)
    // }

    const new_player_ratings = rateTrueskill(
      match.match.data.outcome,
      player_ratings_before,
      ranking.data.elo_settings,
      match.match.data.metadata?.best_of,
    )

    // update current player ratings
    new_player_ratings.forEach((team, i) => {
      team.forEach((new_rating, j) => {
        const player_id = player_ratings_before[i][j].player.data.id
        affected_player_ratings[player_id] = {
          rating: new_rating.new_rating,
          rd: new_rating.new_rd,
        }
      })
    })
  }

  await app.db.matches.updateMatchPlayers(recalculated_match_players)

  const players_to_update: {id: number, rating: number, rd: number}[] = Object.entries(affected_player_ratings).map(([id, {rating, rd}]) => {
    return {id: parseInt(id), rating, rd}
  })

  // await app.db.players.updateMany(players_to_update)

  // update all players' ratings
  await Promise.all(
    Object.entries(affected_player_ratings).map(async ([player_id, { rating, rd }]) => {
      const player = await app.db.players.getById(parseInt(player_id))
      await updatePlayerRating(app, player, rating, rd)
    }),
  )

  // update the leaderboard
  await syncRankingLbMessages(app, ranking)
}
