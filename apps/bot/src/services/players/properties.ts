import { Match, MatchStatus, PartialRanking, Player, Rating, RatingStrategy } from '@repo/db/models'
import { findDoubleIndex } from '@repo/utils'
import { PlayerStats, PlayerStatsSchema } from '../../../../../packages/db/src/models/players'
import { App } from '../../setup/app'
import { getMatchWinners } from '../matches/management/properties'
import { scoreMatch } from '../matches/scoring/score-matches'
import { displayRatingFn } from '../settings/properties'

/**
 * Info about a player in a ranking to display
 */
export type PlayerDisplay = {
  player: Player
  points: number
  is_provisional?: boolean
}

/**
 * Info about a player in a match to display
 */
export type MatchPlayerDisplay = {
  player: Player
  before: { points: number; is_provisional?: boolean }
  after?: { points: number; is_provisional?: boolean }
}

/**
 * If the player is associated with a user or role, return their mention.
 * Otherwise, return their name.
 */
export function mentionOrName(player: Player): string {
  return player.data.user_id
    ? `<@${player.data.user_id}>`
    : player.data.role_id
      ? `<@&${player.data.role_id}>`
      : player.data.name
}

/**
 * Determine a player's wins, losses, draws, winrate, and place on the leaderboard
 */
export async function refreshPlayerStats(app: App, player: Player): Promise<PlayerStats> {
  const ranking = await player.ranking()
  const players = await orderedLeaderboardPlayers(app, ranking)
  const matches = await app.db.matches.getMany({ player_ids: [player.data.id] })

  // Get the display rating
  const display_rating: PlayerStats['display_rating'] = displayRatingFn(app, ranking)(player.data.rating)

  // Determine whether the rd should be displayed
  if (
    ranking.data.rating_settings.rating_strategy === RatingStrategy.Glicko ||
    ranking.data.rating_settings.rating_strategy === RatingStrategy.TrueSkill
  ) {
    display_rating['rd'] = Math.round(player.data.rating.rd ?? ranking.data.rating_settings.initial_rating.rd)
  }

  // Get the leaderboard place
  const player_index = players.findIndex(p => p.player.data.id === player.data.id)
  const lb_place = player_index + 1
  const max_lb_place = players.length

  let wins = 0
  let losses = 0
  let draws = 0

  let rating_history: {
    points: number
    is_provisional?: boolean
    time: Date
  }[] = []

  for (const match of matches) {
    // Calculate wins, losses, draws
    const player_team_index = match.team_players.findIndex(team => team.some(p => p.player.data.id === player.data.id))

    const { winning_team_indices: winning_team_indices, is_draw } = getMatchWinners(match.match)
    if (!winning_team_indices) continue // If this match isn't finished, it's not counted
    if (is_draw) draws++
    else if (winning_team_indices.includes(player_team_index)) wins++
    else losses++

    // Update rating history
    const player_index = match.team_players[player_team_index].findIndex(p => p.player.data.id === player.data.id)
    const player_rating = match.team_players[player_team_index][player_index].rating
    const player_display_rating = displayRatingFn(app, ranking)(player_rating)

    if (match.match.data.time_finished) {
      rating_history.push({
        ...player_display_rating,
        time: match.match.data.time_finished,
      })
    }
  }

  // Add the latest rating to the rating history
  rating_history.push({
    ...display_rating,
    time: new Date(),
  })

  // Calculate winrate
  const total = wins + losses
  const winrate = total === 0 ? null : wins / total

  const stats = {
    display_rating,
    wins,
    losses,
    draws,
    winrate,
    lb_place,
    max_lb_place,
    rating_history,
    stats_last_refreshed: new Date(),
  }

  await player.update({ stats })

  return stats
}

/**
 * Returns the player stats, refreshing them if they are old.
 */
export async function getOrRefreshPlayerStats(app: App, player: Player): Promise<PlayerStats> {
  const stored_stats = player.data.stats
  const parse_result = PlayerStatsSchema.safeParse(stored_stats)

  if (parse_result.success) {
    // Check if the stats are new
    const stats = parse_result.data
    const stats_age = new Date().getTime() - stats.stats_last_refreshed.getTime()
    if (stats_age < 1000 * 10) {
      // 10 seconds
      return stats
    }
  }

  const stats = await refreshPlayerStats(app, player)
  return stats
}

export async function orderedLeaderboardPlayers(app: App, p_ranking: PartialRanking): Promise<PlayerDisplay[]> {
  const ranking = await p_ranking.fetch()
  const players = await app.db.players.fetchMany({ ranking_id: ranking.data.id })

  // Get players' display ratings and sort by them
  const players_display = players
    .map(player => ({
      player,
      ...displayRatingFn(app, ranking)(player.data.rating),
    }))
    .sort((a, b) => b.points - a.points)

  return players_display
}

export async function matchPlayersDisplayStats(app: App, match: Match): Promise<MatchPlayerDisplay[][]> {
  const ranking = await match.ranking.fetch()
  const team_players = await match.players()
  const display = displayRatingFn(app, ranking)

  const new_ratings = scoreMatch({
    match: match,
    match_players: team_players,
    rating_settings: ranking.data.rating_settings,
  })

  const result = team_players.map((team, i) =>
    team.map((match_player, j) => {
      return {
        player: match_player.player,
        before: display(match_player.rating),
        after: new_ratings ? display(new_ratings[i][j]) : undefined,
      }
    }),
  )

  return result
}

/**
 * @returns the player's rating, and time since last match
 * at the specified time.
 * If the previous match has no time finished or no information
 * about the player's rating, returns null for that value
 */
export async function getInfoAtTime(app: App, player: Player, time: Date) {
  // Get the most recent match finished before the specified time
  const result = await app.db.matches.getMany({
    player_ids: [player.data.id],
    finished_before: time,
    status: MatchStatus.Finished,
    limit: 1,
    earliest_first: false,
  })

  const ranking = await player.ranking()

  let seconds: number | null = null
  let rating: Rating | undefined | null = null

  if (result.length !== 0) {
    const { match, team_players } = result[0]

    const last_time = match.data.time_finished

    seconds = last_time ? Math.floor((time.getTime() - last_time.getTime()) / 1000) : null

    // Determine the rating after the match
    const scores = scoreMatch({
      match_players: team_players,
      match: match,
      rating_settings: ranking.data.rating_settings,
    })

    // Determine the player's index in team_players
    const idx = findDoubleIndex(team_players, p => p.player.data.id === player.data.id)

    if (!scores) throw new Error(`No score for player ${player.data.id} in match ${match.data.id}`)
    if (!idx) throw new Error(`Expected to find match player ${player.data.id} in match ${match.data.id}`)

    rating = scores[idx[0]][idx[1]]
  }

  return {
    seconds,
    rating: rating ?? ranking.data.rating_settings.initial_rating,
  }
}
