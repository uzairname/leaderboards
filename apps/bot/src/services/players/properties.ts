import { Match, PartialRanking, Player } from '@repo/db/models'
import { z } from 'zod'
import { App } from '../../setup/app'
import { getOutcome } from '../matches/management/properties'
import { scoreMatch } from '../matches/scoring/score_match'
import { displayRatingFn } from '../rankings/properties'

export type LeaderboardPlayer = {
  user_id: string
  points: number
  is_provisional?: boolean
}

export const PlayerStatsSchema = z.object({
  display_rating: z.object({
    points: z.number(),
    is_provisional: z.boolean().optional(),
  }),
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  winrate: z.number().nullable(),
  lb_place: z.number(),
  max_lb_place: z.number(),
  rating_history: z.array(
    z.object({
      points: z.number(),
      is_provisional: z.boolean().optional(),
      time: z.date(),
    }),
  ),
  stats_last_refreshed: z.date(),
})

export type PlayerStats = z.infer<typeof PlayerStatsSchema>

/**
 * Determine a player's wins, losses, draws, winrate, and place on the leaderboard
 */
export async function winsLosses(app: App, player: Player): Promise<PlayerStats> {
  const ranking = await player.ranking()
  const players = await orderedLeaderboardPlayers(app, ranking)
  const matches = await app.db.matches.getMany({ player_ids: [player.data.id] })

  // Get the display rating
  const display_rating = displayRatingFn(app, ranking)(player.data.rating)

  // Get the leaderboard place
  const player_index = players.findIndex(p => p.user_id === player.data.user_id)
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

    const { winning_team_indices: winning_team_indices, is_draw } = getOutcome(match.match)
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
  const total_matches = wins + losses + draws
  const winrate = total_matches === 0 ? null : wins / total_matches

  return {
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
      return stats
    }
  }

  const stats = await winsLosses(app, player)
  await player.update({ stats })
  return stats
}

export async function orderedLeaderboardPlayers(app: App, p_ranking: PartialRanking): Promise<LeaderboardPlayer[]> {
  const ranking = await p_ranking.fetch()
  const players = await app.db.players.fetchMany({ ranking_id: ranking.data.id })

  // Get players' display ratings and sort by them
  const players_display = players
    .map(player => ({
      user_id: player.data.user_id,
      ...displayRatingFn(app, ranking)(player.data.rating),
    }))
    .sort((a, b) => b.points - a.points)

  return players_display
}

export async function matchPlayersDisplayStats(
  app: App,
  match: Match,
): Promise<
  {
    user_id: string
    before: { points: number; is_provisional?: boolean }
    after?: { points: number; is_provisional?: boolean }
  }[][]
> {
  const ranking = await match.ranking.fetch()
  const team_players = await match.players()
  const display = displayRatingFn(app, ranking)

  const new_ratings = await scoreMatch({
    match: match,
    match_players: team_players,
  })

  const result = team_players.map((team, i) =>
    team.map((match_player, j) => {
      return {
        user_id: match_player.player.data.user_id,
        before: display(match_player.rating),
        after: new_ratings ? display(new_ratings[i][j]) : undefined,
      }
    }),
  )

  return result
}
