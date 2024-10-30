import { APIChannel, ThreadAutoArchiveDuration } from 'discord-api-types/v10'
import { GuildRanking, Match, Player } from '../../../../../database/models'
import { MatchStatus, Vote } from '../../../../../database/models/matches'
import { sentry } from '../../../../../logging/sentry'
import { App } from '../../../../app/App'
import { UserError } from '../../../errors/UserError'
import { syncMatchSummaryMessage } from '../logging/match_summary_message'
import { revertMatch, startNewMatch } from '../management/manage_matches'
import { finishAndScoreMatch } from '../management/score_matches'
import { ongoingMatchPage, ongoing_series_page_config } from './views/pages/ongoing_match'

export async function onPlayerVote(
  app: App,
  match: Match,
  voting_user_id: string,
  vote: Vote,
): Promise<void> {
  const team_players = await match.teamPlayers()

  const team_index = team_players.findIndex(team =>
    team.some(p => p.player.data.user_id === voting_user_id),
  )
  if (team_index == -1) throw new UserError(`You aren't participating in this match`)

  const team_votes = match.data.team_votes ?? team_players.map(_ => Vote.Undecided)

  team_votes[team_index] = team_votes[team_index] === vote ? Vote.Undecided : vote

  await match.update({ team_votes: team_votes })

  // Act on voting results

  const all_cancel_votes = team_votes.every(v => v === Vote.Cancel)
  if (all_cancel_votes && match.data.status === MatchStatus.Ongoing) {
    await revertMatch(app, match)
  }

  const unanimous_win =
    team_votes.every(v => v !== Vote.Undecided) &&
    team_votes.filter(v => v === Vote.Win).length === 1

  if (unanimous_win && match.data.status === MatchStatus.Ongoing) {
    const outcome = team_votes.map(v => (v === Vote.Win ? 1 : 0))
    sentry.debug('scoring match')
    await finishAndScoreMatch(app, match, outcome)
  }
}

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

  const thread = await app.discord.createPublicThread(
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
    app.discord
      .createMessage(
        thread.id,
        (
          await ongoingMatchPage(
            app,
            ongoing_series_page_config.newState({
              match_id: match.data.id,
            }),
          )
        ).as_post,
      )
      .then(message => {
        app.discord.pinMessage(thread.id, message.id)
      }),
  ])

  return { match, thread }
}
