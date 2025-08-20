import { Match, MatchInsert, MatchMetadata, MatchStatus, Player, Rating } from '@repo/db/models'
import { UserError } from '../../../errors/user-errors'
import { App } from '../../../setup/app'
import { mentionOrName } from '../../players/properties'
import { syncMatchSummaryMessages } from '../logging/match-summary-message'
import { rescoreMatches } from '../scoring/score-matches'
import { GuildAuth, ensureGuildAdminPerms } from '../../perms'

// The match updating service. Responsible for updating match outcomes, and canceling matches.

/**
 * Sets the time finished to now and the status to canceled.
 * Archives the ongoing match channel, if it exists.
 */
export async function cancelMatch(app: App, match: Match, auth: GuildAuth | 'vote'): Promise<void> {
  // Update the match status and time finished

  auth !== 'vote' && (await ensureGuildAdminPerms(app, auth))

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
 * Utility function to set the match outcome based on winner's user id, role, or name
 */
export async function setMatchWinner(app: App, match: Match, player: Player, auth: GuildAuth) {
  await ensureGuildAdminPerms(app, auth)

  const team_players = await match.players()

  const team_index = team_players.findIndex(team => team.some(p => p.player.data.id === player.data.id))
  if (team_index == -1) throw new UserError(`${mentionOrName(player)} isn't participating in this match`)

  const outcome = team_players.map((_, i) => (i === team_index ? 1 : 0))
  await updateMatchOutcome(app, match, auth, outcome)
}

/**
 * Sets the match outcome to a draw (all teams have the same score)
 */
export async function setMatchDraw(app: App, match: Match, auth: GuildAuth) {
  await ensureGuildAdminPerms(app, auth)

  const team_players = await match.players()
  const outcome = team_players.map(() => 0.5)
  await updateMatchOutcome(app, match, auth, outcome)
}

/**
 * Updates a match's outcome and recalculates player ratings. Sets its status to finished.
 * If it wasn't finished yet, sets time finished to now.
 */
export async function updateMatchOutcome(
  app: App,
  match: Match,
  auth: GuildAuth | 'vote',
  outcome: number[],
  {
    metadata,
  }: {
    metadata?: MatchMetadata | null
  } = {},
) {
  app.logger.debug(`updateMatchOutcome: ${match} outcome ${outcome}`)

  auth !== 'vote' && (await ensureGuildAdminPerms(app, auth))

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
 * Ensures that all players are in the same ranking,  teams have consistent sizes, and no duplicate players.
 * Throws an error if the match data is invalid.
 */
export function validateMatchData(o: Partial<{ players: Player[][] } & MatchInsert>): void {
  if (o.outcome) {
    if (o.players) {
      if (o.outcome.length !== o.players.length) throw new Error(`Match outcome and players length must match`)
    }
  }

  if (o.players) {
    const team_player_ids = o.players.map(team => team.map(p => p.data.id))
    if (team_player_ids.flat().length !== new Set(team_player_ids.flat()).size)
      throw new UserError(`Cannot have duplicate players in a match`)
    if (new Set(o.players.flat().map(p => p.data.ranking_id)).size !== 1)
      throw new UserError(`Players must be from the same ranking`)
  }
}
