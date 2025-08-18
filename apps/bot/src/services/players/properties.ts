import { Match, MatchStatus, Player, Ranking, Rating, RatingStrategy } from '@repo/db/models'
import { findDoubleIndex, nonNullable } from '@repo/utils'
import { PlayerStats, PlayerStatsSchema } from '../../../../../packages/db/src/models/players'
import { App } from '../../setup/app'
import { getMatchWinners } from '../matches/management/properties'
import { scoreMatch } from '../matches/scoring/score-matches'
import { displayRatingFn } from '../rankings/properties'
import { calculateRankRolesForPlayer } from './rank-roles'

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
 * and saves it to the database
 */
export async function updatePlayerStats(app: App, player: Player, lb_players?: PlayerDisplay[]): Promise<PlayerStats> {
  const ranking = await player.ranking()
  lb_players = lb_players ?? (await orderedLeaderboardPlayers(app, ranking))
  const matches = await app.db.matches.getMany({ player_ids: [player.data.id] })
  const grs = await app.db.guild_rankings.fetch({ ranking_id: ranking.data.id })

  // Get the display rating
  const display_rating: PlayerStats['display_rating'] = displayRatingFn(app, ranking)(player.data.rating)

  // Determine whether the rd should be displayed
  if (
    ranking.data.rating_settings.rating_strategy === RatingStrategy.Glicko ||
    ranking.data.rating_settings.rating_strategy === RatingStrategy.TrueSkill ||
    ranking.data.rating_settings.rating_strategy === RatingStrategy.Bayesian
  ) {
    display_rating['rd'] = Math.round(player.data.rating.rd ?? ranking.data.rating_settings.initial_rating.rd)
  }

  // Get the leaderboard place
  const ranked_lb_players = lb_players.filter(p => !p.is_provisional)
  const player_index = ranked_lb_players.findIndex(p => p.player.data.id === player.data.id)
  const lb_place = player_index === -1 ? null : player_index + 1
  const max_lb_place = ranked_lb_players.length > 0 ? ranked_lb_players.length : null

  let wins = 0
  let losses = 0
  let draws = 0

  let total_opponent_rating = 0
  let total_opponents = 0

  let rating_history: {
    points: number
    is_provisional?: boolean
    time: number
  }[] = []

  for (const match of matches) {
    // Calculate wins, losses, draws
    const [team_idx, player_idx] = nonNullable(
      findDoubleIndex(match.team_players, p => p.player.data.id === player.data.id),
      'player index',
    )

    const { winning_team_indices: winning_team_indices, is_draw } = getMatchWinners(match.match)
    if (!winning_team_indices) continue // If this match isn't finished, it's not counted
    if (is_draw) draws++
    else if (winning_team_indices.includes(team_idx)) wins++
    else losses++

    // Update rating history
    const player_rating = match.team_players[team_idx][player_idx].rating
    const player_display_rating = displayRatingFn(app, ranking)(player_rating)

    // Update opponent ratings
    const other_team_players = match.team_players.filter((_, i) => team_idx !== i).flat()
    const sum = other_team_players.reduce((acc, opponent) => {
      const opponent_rating = displayRatingFn(app, ranking)(opponent.rating)
      return acc + opponent_rating.points
    }, 0)
    total_opponent_rating += sum
    total_opponents += other_team_players.length

    if (match.match.data.time_finished) {
      rating_history.push({
        ...player_display_rating,
        time: match.match.data.time_finished.getTime(),
      })
    }
  }

  const avg_opponent_rating = total_opponents === 0 ? null : total_opponent_rating / total_opponents

  // Add the latest rating to the rating history
  rating_history.push({
    ...display_rating,
    time: new Date().getTime(),
  })

  // Calculate winrate
  const total = wins + losses
  const winrate = total === 0 ? null : wins / total

  // Calculate featured rank roles for each guild the player is in.
  var rank_roles: Record<string, string[]> = {}
  for (const gr of grs) {
    const guild_rank_roles = await calculateRankRolesForPlayer(app, player, gr.guild_ranking)
    const role_ids = guild_rank_roles.filter(([_, has_role]) => has_role).map(([role_id, _]) => role_id)
    rank_roles[gr.guild_ranking.data.guild_id] = role_ids
  }

  const stats = {
    display_rating,
    wins,
    losses,
    draws,
    winrate,
    avg_opponent_rating,
    lb_place,
    max_lb_place,
    rating_history,
    rank_roles,
    stats_last_refreshed: new Date().getTime(),
  }

  await player.update({ stats })

  return stats
}

/**
 * Returns the player's stats
 * @param fetch If false, returns undefined if there is a parse error or they are undefined
 * If true, fetches them if they are unavailable or old
 */
export async function getPlayerStats<T extends boolean = true>(
  app: App,
  player: Player,
  fetch: T = true as T,
): Promise<T extends true ? PlayerStats : PlayerStats | undefined> {
  const parse_result = PlayerStatsSchema.safeParse(player.data.stats)

  if (parse_result.success) {
    if (fetch) {
      // Check if the stats are older than 1 minute
      const stats_age = new Date().getTime() - parse_result.data.stats_last_refreshed
      if (stats_age > 1000 * 60 * 1) {
        return updatePlayerStats(app, player)
      }
    }
    return parse_result.data
  } else {
    app.logger.debug(`failed parsing stats for player ${player}`)
    return (fetch ? updatePlayerStats(app, player) : undefined) as T extends true
      ? PlayerStats
      : PlayerStats | undefined
  }
}

export async function orderedLeaderboardPlayers(app: App, ranking: Ranking): Promise<PlayerDisplay[]> {
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

    if (!scores) throw new Error(`No score for player ${player.data.id} in finished match ${match.data.id}`)
    if (!idx) throw new Error(`Expected to find match player ${player.data.id} in match ${match.data.id}`)

    rating = scores[idx[0]][idx[1]]
  }

  return {
    seconds,
    rating: rating ?? ranking.data.rating_settings.initial_rating,
  }
}
