import { Match } from '../../../../../database/models'
import {
  MatchInsert,
  MatchMetadata,
  MatchStatus,
  MatchTeamPlayer,
} from '../../../../../database/models/matches'
import { App } from '../../../../app/App'
import { UserError } from '../../../errors/UserError'
import { syncMatchSummaryMessages } from '../logging/match-summary-message'
import { rescoreMatches } from './score-matches'

/**
 * Updates a match's outcome and/or metadata. Recalculates rankings if outcome is provided.
 */
export async function updateMatchOutcome(
  app: App,
  match: Match,
  outcome: number[],
  metadata?: MatchMetadata | null,
) {
  validateMatchData({
    ...match.data,
    outcome,
    metadata,
  })

  const time_finished = match.data.time_finished ?? new Date()

  await match.update({
    outcome,
    metadata,
    status: MatchStatus.Scored,
    time_finished,
  })

  if (outcome) {
    await rescoreMatches(app, await match.ranking(), time_finished)
  }

  await syncMatchSummaryMessages(app, match)
}

/**
 * Deletes a finished match and reverses its effects on rankings.
 * Deletes all summary messages
 */
export async function revertMatch(app: App, match: Match): Promise<void> {
  // delete summary messages before deleting match
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: match.data.ranking_id })
  await Promise.all(
    guild_rankings.map(async guild_ranking => {
      const summary_message = await match.getSummaryMessage(guild_ranking.guild.data.id)
      await app.discord.deleteMessageIfExists(
        guild_ranking.guild.data.matches_channel_id,
        summary_message?.message_id,
      )
    }),
  )

  // If the match isn't finished, it had no effect on rankings
  if (match.data.status !== MatchStatus.Scored) return 

  // Revert its effects on rankings
  const player_ratings_before: Record<number, { rating: number; rd: number }> =
    Object.fromEntries(
      (await match.teamPlayers())
        .map(t =>
          t.map(p => [
            p.player.data.id,
            {
              rating: p.rating_before,
              rd: p.rd_before,
            },
          ]),
        )
        .flat(),
    )

  await match.delete()

  // score ranking history without match
  await rescoreMatches(
    app,
    await match.ranking(),
    match.data.time_finished ?? undefined,
    player_ratings_before,
  )
}


/**
 * Cancels an ongoing match.
 */
export async function cancelMatch(app: App, match: Match): Promise<void> {
  if (match.data.status !== MatchStatus.Ongoing) return

  await match.update({
    status: MatchStatus.Canceled,
  })

  const thread_id = match.data.ongoing_match_channel_id
  if (thread_id) {
    await app.discord.editChannel(thread_id, {
      archived: true,
    })
  }
}




export function validateMatchData<
  T extends Partial<{ team_players: MatchTeamPlayer[][] } & MatchInsert>,
>(o: T): T {
  if (o.outcome) {
    if (o.team_players) {
      if (o.outcome.length !== o.team_players.length)
        throw new UserError(`Match outcome and players length must match`)
    }
  }

  if (o.team_players) {
    const team_player_ids = o.team_players.map(team => team.map(p => p.player.data.id))
    if (team_player_ids.flat().length !== new Set(team_player_ids.flat()).size)
      throw new UserError(`Duplicate players in a match`)
    if (new Set(o.team_players.flat().map(p => p.player.data.ranking_id)).size !== 1)
      throw new UserError(`Players must be from the same ranking`)
  }
  return o
}
