import { APIChannel, ThreadAutoArchiveDuration } from 'discord-api-types/v10'
import { App } from '../../../../app/App'
import { GuildRanking, Player } from '../../../../../database/models'
import { Match } from '../../../../../database/models/matches'
import { syncMatchSummaryMessage } from '../logging/match_summary_message'
import { startNewMatch } from '../management/manage_matches'
import { ongoing_series_msg_signature, ongoingMatchPage } from './views/pages/ongoing_match'

/**
 * Creates a public thread for a single match and sends the match message.
 */
export async function start1v1SeriesThread(
  app: App,
  guild_ranking: GuildRanking,
  players: Player[][],
  best_of?: number,
): Promise<{ match: Match; thread: APIChannel }> {
  const team_players = players.map(team =>
    team.map(p => ({ player: p, rating_before: p.data.rating, rd_before: p.data.rd })),
  )

  const [match, guild] = await Promise.all([
    startNewMatch(app, guild_ranking, team_players, { best_of: best_of ?? 1 }),
    guild_ranking.guild,
  ])

  const match_message = await syncMatchSummaryMessage(app, match, guild)

  const thread = await app.bot.createPublicThread(
    {
      name: `${team_players[0][0].player.data.name} vs ${team_players[1][0].player.data.name}`,
      auto_archive_duration: ThreadAutoArchiveDuration.OneHour,
      invitable: true,
    },
    match_message.channel_id,
    match_message.id,
  )

  await Promise.all([
    match.update({ ongoing_match_channel_id: thread.id }),
    app.bot
      .createMessage(
        thread.id,
        (
          await ongoingMatchPage(
            app,
            ongoing_series_msg_signature.createState({
              match_id: match.data.id,
            }),
          )
        ).as_post,
      )
      .then(message => {
        app.bot.pinMessage(thread.id, message.id)
      }),
  ])

  return { match, thread }
}
