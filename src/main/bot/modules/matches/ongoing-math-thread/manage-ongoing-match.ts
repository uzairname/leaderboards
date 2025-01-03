import { APIChannel, ThreadAutoArchiveDuration } from 'discord-api-types/v10'
import { Match, Player } from '../../../../../database/models'
import { PartialGuildRanking } from '../../../../../database/models/guildrankings'
import { Vote } from '../../../../../database/models/matches'
import { sentry } from '../../../../../logging/sentry'
import { App } from '../../../../app/App'
import { UserError } from '../../../errors/UserError'
import { syncMatchSummaryMessage } from '../logging/match-summary-message'
import { cancelMatch, updateMatchOutcome } from '../management/manage-matches'
import { startNewMatch } from '../management/match-creation'
import { ongoingMatchPage, ongoing_series_page_config } from './views/pages/ongoing-match'

/**
 * Starts a new match. Syncs the match's summary message in the guild
 * and creates the thread to manage the ongoing match.
 */
export async function start1v1SeriesThread(
  app: App,
  guild_ranking: PartialGuildRanking,
  players: Player[][],
  best_of?: number,
): Promise<{ match: Match; thread: APIChannel }> {
  const { guild, ranking } = await guild_ranking.fetch()

  const match = await startNewMatch(app, ranking, players, best_of)

  const match_message = await syncMatchSummaryMessage(app, match, guild)

  const thread = await app.discord.createPublicThread(
    {
      name: `${players[0][0].data.name} vs ${players[1][0].data.name}`,
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

/**
 * Cast a win, loss, draw, or cancel vote for a match
 */
export async function castPlayerVote(
  app: App,
  match: Match,
  voting_user_id: string,
  vote: Vote,
): Promise<void> {
  const team_players = await match.players()

  // ensure the user is in the match
  const team_index = team_players.findIndex(team =>
    team.some(p => p.player.data.user_id === voting_user_id),
  )
  if (team_index == -1) throw new UserError(`You aren't participating in this match`)

  // update the vote
  const team_votes = match.data.team_votes ?? team_players.map(_ => Vote.Undecided)
  team_votes[team_index] = team_votes[team_index] === vote ? Vote.Undecided : vote
  await match.update({ team_votes: team_votes })

  // act on voting results if it is ongoing
  sentry.debug(`Casted votes. Match:${match}`)

  // if all votes are cancel, revert the match
  const all_cancel_votes = team_votes.every(v => v === Vote.Cancel)
  if (all_cancel_votes) {
    await cancelMatch(app, match)
  }

  // if the votes agree on one winner, score the match
  const unanimous_win =
    team_votes.every(v => v === Vote.Win || v === Vote.Loss) &&
    team_votes.filter(v => v === Vote.Win).length === 1

  if (unanimous_win) {
    const outcome = team_votes.map(v => (v === Vote.Win ? 1 : 0))
    await updateMatchOutcome(app, match, outcome)
  }
}
