import { Match } from 'database/models'
import {
  MatchInsert,
  MatchMetadata,
  MatchPlayer,
  MatchStatus,
} from 'database/models/matches'
import { PartialPlayer } from 'database/models/players'
import { PartialRanking, Rating } from 'database/models/rankings'
import { AnyDeferContext } from 'discord-framework'
import { sentry } from '../../../../logging/sentry'
import { App } from '../../../setup/app'
import { UserError } from '../../../errors/UserError'
import { updatePlayerRatings } from '../../players/manage-players'
import { syncMatchSummaryMessages } from '../logging/match-summary-message'
import { Scorer } from './rating-calculation'

// The match management service. Responsible for updating match outcomes, canceling matches, and reverting matches.

/**
 * Cancels a match. Sets the time finished to now and status to canceled.
 * Archives the ongoing match channel.
 */
export async function cancelMatch(app: App, match: Match): Promise<void> {
  sentry.debug(`cancelMatch: ${match}`)

  // Update the match status and time finished
  await match.update({
    status: MatchStatus.Canceled,
    time_finished: match.data.time_finished ?? new Date(Date.now()),
  })

  // Archive the ongoing match thread and update the message
  const thread_id = match.data.ongoing_match_channel_id
  if (thread_id) {
    await app.discord.editChannel(thread_id, {
      archived: true,
    })
  }
  await syncMatchSummaryMessages(app, match)

  // Get the player ratings before the match. Use these as a starting point to recalculate rankings
  const affected_player_ratings: Map<number, Rating> = new Map()
  const players = await match.players()
  players.flat().forEach(p => {
    affected_player_ratings.set(p.player.data.id, p.player.data.rating)
  })

  // Score ranking history with this match canceled, and update the match summary messages
  await rescoreMatches(app, match.ranking, {
    finished_on_or_after: match.data.time_finished,
    affected_ratings: affected_player_ratings,
  })
  await syncMatchSummaryMessages(app, match)
}

export async function setMatchWinner(app: App, match: Match, user_id: string) {
  const team_players = await match.players()

  const team_index = team_players.findIndex(team =>
    team.some(p => p.player.data.user_id === user_id),
  )
  if (team_index == -1) throw new UserError(`<@${user_id}> isn't participating in this match`)

  const outcome = team_players.map((_, i) => (i === team_index ? 1 : 0))
  await updateMatchOutcome(app, match, outcome)
}

/**
 * Updates a match's outcome and recalculates player ratings. Sets its status to finished.
 * If it wasn't finished yet, sets time finished to now.
 */
export async function updateMatchOutcome(
  app: App,
  match: Match,
  outcome: number[],
  {
    metadata,
  }: {
    metadata?: MatchMetadata | null
  } = {},
) {
  sentry.debug(`updateMatchOutcome: ${match} outcome ${outcome}`)

  validateMatchData({
    ...match.data,
    outcome,
    metadata,
  })

  match = await match.update({
    time_finished: match.data.time_finished ?? new Date(Date.now()),
    status: MatchStatus.Finished,
    outcome,
    metadata,
  })

  await rescoreMatches(app, match.ranking, { finished_on_or_after: match.data.time_finished })
  await syncMatchSummaryMessages(app, match)
}

/**
 * Recalculate ratings in the ranking based on all matches after the specified date.
 * @param affected_ratings A map of player IDs to their ratings before any of these matches were scored
 *  The running recalculation of player ratings.
 *  This object is updated as matches are processed
 *  Ends up being the updated player ratings after the latest match
 * @param reset_rating_to_initial If provided, all players not in affected_ratings will be reset to the initial rating.
 */
export async function rescoreMatches(
  app: App,
  p_ranking: PartialRanking,
  {
    finished_on_or_after,
    affected_ratings: running_player_ratings = new Map(),
    reset_rating_to_initial,
    scorer = app.config.defaultScorer,
    ctx,
  }: {
    finished_on_or_after?: Date | null
    affected_ratings?: Readonly<Map<number, Rating>>
    reset_rating_to_initial?: boolean
    scorer?: Scorer
    ctx?: AnyDeferContext
  } = {},
) {
  ctx?.edit({ content: `Recalculating ratings...` })

  const ranking = await p_ranking.fetch()

  const matches = await app.db.matches.getMany({
    ranking_ids: [ranking.data.id],
    finished_at_or_after: finished_on_or_after,
  })

  sentry.debug(
    `rescoreMatches(${ranking}, on_or_after ${finished_on_or_after}). rescoring ${matches.length} matches`,
  )

  // List of match players that need to be updated. Indicates ratings for each player before each match
  const match_players_update: { match_id: number; update: MatchPlayer }[] = []

  for (const match of matches) {
    const match_players: MatchPlayer[][] = match.team_players.map(team =>
      team.map(mp => {
        /* 
        Determine player ratings before the match. 
        If their rating was recalculated, use that.
        If not, reset them if specified, otherwise leave them as they were before.
        */
        const rating_before =
          running_player_ratings.get(mp.player.data.id) ??
          (reset_rating_to_initial ? ranking.data.initial_rating : mp.rating)

        const new_match_player = { ...mp, rating: rating_before }
        match_players_update.push({ match_id: match.match.data.id, update: new_match_player })
        running_player_ratings.set(mp.player.data.id, rating_before)
        return new_match_player
      }),
    )

    // Determine whether the match had an effect on any player ratings
    if (match.match.data.status !== MatchStatus.Finished || !match.match.data.outcome) continue

    // Recalculate the player ratings
    const new_ratings = scorer(
      match.match.data.outcome,
      match_players,
      ranking.data.initial_rating,
      match.match.data.metadata?.best_of,
    )

    // Update recalculated_player_ratings
    new_ratings.forEach((team, i) =>
      team.forEach((recalculated_rating, j) => {
        const player_id = match_players[i][j].player.data.id
        running_player_ratings.set(player_id, recalculated_rating)
      }),
    )
  }

  await app.db.matches.updateMatchPlayers(match_players_update)

  const new_players: { player: PartialPlayer; rating: Rating }[] = []
  for (const [player_id, rating] of running_player_ratings) {
    new_players.push({ player: app.db.players.get(player_id), rating })
  }

  // update all players' ratings
  await updatePlayerRatings(app, new_players)

  await ctx?.edit({
    content: `Done. (${matches.length} matches rescored, ${new_players.length} players' ratings updated)`,
  })

  return new_players
}

export function validateMatchData(o: Partial<{ players: MatchPlayer[][] } & MatchInsert>): void {
  if (o.outcome) {
    if (o.players) {
      if (o.outcome.length !== o.players.length)
        throw new Error(`Match outcome and players length must match`)
    }
  }

  if (o.players) {
    const team_player_ids = o.players.map(team => team.map(p => p.player.data.id))
    if (team_player_ids.flat().length !== new Set(team_player_ids.flat()).size)
      throw new UserError(`Duplicate players in a match`)
    if (new Set(o.players.flat().map(p => p.player.data.ranking_id)).size !== 1)
      throw new UserError(`Players must be from the same ranking`)
  }
}
