import { Match, Ranking } from '../../../../../database/models'
import { MatchMetadata, MatchStatus, MatchTeamPlayer } from '../../../../../database/models/matches'
import { sentry } from '../../../../../logging/sentry'
import { nonNullable } from '../../../../../utils/utils'
import { App } from '../../../../app/App'
import { updatePlayerRating } from '../../players/manage_players'
import { default_elo_settings } from '../../rankings/manage_rankings'
import { rateTrueskill } from './elo_calculation'
import { validateMatchData } from './manage_matches'

export async function finishAndScoreMatch(
  app: App,
  match: Match,
  outcome: number[],
): Promise<Match> {
  if (match.data.status === MatchStatus.Finished) {
    return match
  }

  await match.update({
    status: MatchStatus.Finished,
    time_finished: new Date(),
    outcome,
  })

  const ranking = await match.ranking()
  const team_players = await match.teamPlayers()

  return scoreMatch(app, match, team_players, ranking)
}

/**
 * Validates and records a new match from players, outcome, and metadata. Updates players' scores.
 * @param team_player_ids list of player ids for each team
 * @param outcome relative team scores
 */
export async function createAndScoreMatch(
  app: App,
  ranking: Ranking,
  team_players: MatchTeamPlayer[][],
  outcome: number[],
  time_started?: Date,
  time_finished?: Date,
  metadata?: MatchMetadata,
): Promise<Match> {
  // add match

  const validated_data = validateMatchData({
    ranking_id: ranking.data.id,
    team_players,
    outcome,
    metadata,
    time_started,
    time_finished,
  })

  const match = await app.db.matches.create({
    ranking,
    team_players,
    outcome,
    metadata,
    time_started,
    time_finished,
    status: MatchStatus.Finished,
  })

  const scored_match = scoreMatch(app, match, team_players, ranking)

  await app.events.MatchCreatedOrUpdated.emit(match)

  return scored_match
}

export async function scoreMatch(
  app: App,
  match: Match,
  team_players: MatchTeamPlayer[][],
  ranking: Ranking,
): Promise<Match> {
  // calculate new player ratings
  const outcome = nonNullable(match.data.outcome, 'match.outcome')
  const new_player_ratings = rateTrueskill(
    outcome,
    team_players,
    ranking.data.elo_settings ?? default_elo_settings,
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

  await app.events.RankingLeaderboardUpdated.emit(ranking)

  return match
}

export async function scoreRankingHistory(
  app: App,
  ranking: Ranking,
  finished_on_or_after?: Date,
  affected_player_ratings: { [key: number]: { rating: number; rd: number } } = {},
) {
  /*
  update all players' score based on match history
  */

  const matches = await app.db.matches.getMany({
    ranking_ids: [ranking.data.id],
    finished_on_or_after: finished_on_or_after,
    status: MatchStatus.Finished,
  })

  sentry.debug(`Rescoring ${matches.length} matches`)

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
        }

        return {
          player: current_player.player,
          rating_before: affected_player_ratings[player_id]?.rating ?? current_player.rating_before,
          rd_before: affected_player_ratings[player_id]?.rd ?? current_player.rd_before,
        }
      }),
    )

    if (player_ratings_before_changed) {
      // update match players' ratings and rd before
      await match.match.updatePlayerRatingsBefore(player_ratings_before)
    }

    const new_player_ratings = rateTrueskill(
      match.match.data.outcome,
      player_ratings_before,
      ranking.data.elo_settings ?? default_elo_settings,
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

    sentry.debug('affected player ratings: ', JSON.stringify(affected_player_ratings))
  }

  // update all players' ratings
  await Promise.all(
    Object.entries(affected_player_ratings).map(async ([player_id, { rating, rd }]) => {
      sentry.debug(`updating player ${player_id} rating to ${rating}`)
      const player = await app.db.players.getById(parseInt(player_id))
      sentry.debug(`player: ${player.data.id}`)
      await updatePlayerRating(app, player, rating, rd)
    }),
  )

  await app.events.RankingLeaderboardUpdated.emit(ranking)
}
