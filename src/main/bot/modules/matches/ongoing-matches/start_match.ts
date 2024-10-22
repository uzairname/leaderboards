import { APIChannel } from 'discord-api-types/v10'
import { App } from '../../../../context/app_context'
import { GuildRanking, Player } from '../../../../database/models'
import { Match, MatchStatus, MatchTeamPlayer, Vote } from '../../../../database/models/matches'
import { UserError } from '../../../utils/UserError'
import { validateMatchData } from '../recording/manage_matches'
import { syncOngoingMatchesChannel } from './ongoing_matches_channel'
import { ongoing_match_msg_signature, ongoingMatchPage } from './views/pages/ongoing_match_view'

export async function startNewMatch(
  app: App,
  guild_ranking: GuildRanking,
  team_players: MatchTeamPlayer[][],
): Promise<Match> {
  validateMatchData({ team_players })

  // check if players are already in an active match
  const player_active_matches = await app.db.matches.getMany({
    player_ids: team_players.flat().map(p => p.player.data.id),
    status: MatchStatus.Ongoing,
  })

  if (player_active_matches.length > 0) {
    throw new UserError(`Some of these players are already in an ongoing match.`)
  }

  const ranking = await guild_ranking.ranking

  const match = await app.db.matches.create({
    ranking,
    team_players: team_players,
    team_votes: team_players.map(_ => Vote.Undecided),
    status: MatchStatus.Ongoing,
  })

  return match
}

/**
 * Creates a private thread for the match and sends the match message.
 */
export async function start1v1MatchAndThread(
  app: App,
  guild_ranking: GuildRanking,
  players: Player[][],
): Promise<{ match: Match; thread: APIChannel }> {
  const team_players = players.map(team =>
    team.map(p => ({ player: p, rating_before: p.data.rating, rd_before: p.data.rd })),
  )

  const match = await startNewMatch(app, guild_ranking, team_players)

  const ranking = await guild_ranking.ranking
  const ongoing_matches_channel = await syncOngoingMatchesChannel(app, guild_ranking)

  const thread = await app.bot.createPrivateThread(
    {
      name: `${team_players[0][0].player.data.name} vs ${team_players[1][0].player.data.name}`,
      auto_archive_duration: 60,
      invitable: true,
    },
    ongoing_matches_channel.id,
  )

  await match.update({ ongoing_match_channel_id: thread.id })

  const message = await app.bot.createMessage(
    thread.id,
    (
      await ongoingMatchPage(
        app,
        ongoing_match_msg_signature.newState({
          match_id: match.data.id,
        }),
      )
    ).as_post,
  )

  await app.bot.pinMessage(thread.id, message.id)

  return { match, thread }
}
