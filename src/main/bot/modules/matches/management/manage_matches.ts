import { GuildRanking, Match } from '../../../../../database/models'
import {
  MatchInsert,
  MatchMetadata,
  MatchStatus,
  MatchTeamPlayer,
  Vote,
} from '../../../../../database/models/matches'
import { App } from '../../../../app/App'
import { UserError } from '../../../errors/UserError'
import { existingChannelMention } from '../../../helpers/strings'
import { scoreRankingHistory } from './score_matches'

export async function startNewMatch(
  app: App,
  guild_ranking: GuildRanking,
  team_players: MatchTeamPlayer[][],
  metadata?: MatchMetadata,
): Promise<Match> {
  validateMatchData({ team_players })

  // check if players are already in an active match
  const active_matches = await app.db.matches.getMany({
    player_ids: team_players.flat().map(p => p.player.data.id),
    ranking_ids: [guild_ranking.data.ranking_id],
    status: MatchStatus.Ongoing,
  })

  if (active_matches.length > 0) {
    throw new UserError(
      `Finish the following match${active_matches.length === 1 ? `` : `es`} before starting a new one:` +
        `\n` +
        (
          await Promise.all(
            active_matches.map(async m => {
              const channel_mention = await existingChannelMention(
                app,
                m.match.data.ongoing_match_channel_id,
              )
              return `\`${m.match.data.id}\`` + (channel_mention ? `: ${channel_mention}` : ``) + ``
            }),
          )
        ).join(`\n`),
    )
  }

  const ranking = await guild_ranking.ranking

  const match = await app.db.matches.create({
    ranking,
    team_players,
    team_votes: team_players.map(_ => Vote.Undecided),
    status: MatchStatus.Ongoing,
    metadata,
  })

  return match
}

/**
 * Updates a match's outcome and/or metadata. Recalculates rankings if outcome is provided.
 */
export async function updateMatchOutcome(
  app: App,
  match: Match,
  outcome: number[],
  metadata?: MatchMetadata,
) {
  validateMatchData({
    ...match.data,
    outcome,
    metadata,
  })

  await match.update({
    outcome,
    metadata,
    status: outcome ? MatchStatus.Finished : MatchStatus.Ongoing,
  })

  if (outcome) {
    await scoreRankingHistory(app, await match.ranking(), match.data.time_finished ?? undefined)
  }

  await app.events.MatchCreatedOrUpdated.emit(match)
}

/**
 * Deletes a match and reverses its effects on rankings.
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

  if (match.data.status === MatchStatus.Finished) {
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
    await scoreRankingHistory(
      app,
      await match.ranking(),
      match.data.time_finished ?? undefined,
      player_ratings_before,
    )
  } else {
    // The match is ongoing. It had no effect on rankings
    // The match may have a thread
    const thread_id = match.data.ongoing_match_channel_id
    if (thread_id) {
      await app.discord.editChannel(thread_id, {
        locked: true,
      })
    }
    await match.delete()
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
