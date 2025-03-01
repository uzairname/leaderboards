import { Match, MatchInsert, MatchMetadata, MatchPlayer, MatchStatus, Rating } from '@repo/db/models'
import { UserError } from '../../../errors/user-errors'
import { sentry } from '../../../logging/sentry'
import { App } from '../../../setup/app'
import { syncMatchSummaryMessages } from '../logging/match-summary-message'
import { rescoreMatches } from '../scoring/score_match'

// The match updating service. Responsible for updating match outcomes, and canceling matches.

/**
 * Sets the time finished to now and the status to canceled.
 * Archives the ongoing match channel, if it exists.
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

/**
 * Utility function to set the match outcome based on winner's user id
 */
export async function setMatchWinner(app: App, match: Match, user_id: string) {
  const team_players = await match.players()

  const team_index = team_players.findIndex(team => team.some(p => p.player.data.user_id === user_id))
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

export function validateMatchData(o: Partial<{ players: MatchPlayer[][] } & MatchInsert>): void {
  if (o.outcome) {
    if (o.players) {
      if (o.outcome.length !== o.players.length) throw new Error(`Match outcome and players length must match`)
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
