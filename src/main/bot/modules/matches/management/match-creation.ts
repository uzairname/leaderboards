import { APIChannel, ThreadAutoArchiveDuration } from 'discord-api-types/v10'
import { GuildRanking, Match, Player, Ranking } from '../../../../../database/models'
import {
  MatchMetadata,
  MatchStatus,
  MatchPlayer,
  Vote,
} from '../../../../../database/models/matches'
import { PlayerFlags } from '../../../../../database/models/players'
import { sentry } from '../../../../../logging/sentry'
import { App } from '../../../../app/App'
import { UserError, UserErrors } from '../../../errors/UserError'
import { syncMatchSummaryMessage } from '../logging/match-summary-message'
import {
  ongoingMatchPage,
  ongoing_series_page_config,
} from '../ongoing-series/views/pages/ongoing-match'
import { validateMatchData } from './manage-matches'
import { scoreMatch } from './score-matches'

export async function start1v1SeriesThread(
  app: App,
  guild_ranking: GuildRanking,
  players: Player[][],
  best_of?: number,
): Promise<{ match: Match; thread: APIChannel }> {
  const team_players = players.map(team =>
    team.map(p => ({
      player: p,
      rating_before: p.data.rating,
      rd_before: p.data.rd,
      flags: p.data.flags,
    })),
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

export async function startNewMatch(
  app: App,
  guild_ranking: GuildRanking,
  team_players: MatchPlayer[][],
  metadata?: MatchMetadata,
): Promise<Match> {
  validateMatchData({ team_players })

  const ranking = await guild_ranking.ranking

  await ensureNoActiveMatches(
    app,
    team_players.flat().map(p => p.player.data.id),
    ranking.data.id,
  )

  await ensurePlayersEnabled(
    app,
    team_players.flat().map(p => p.player),
    ranking,
  )

  // shuffle teams
  const shuffled_team_players = team_players.sort(() => Math.random() - 0.5)

  const match = await app.db.matches.create({
    ranking,
    team_players: shuffled_team_players,
    team_votes: team_players.map(_ => Vote.Undecided),
    status: MatchStatus.Ongoing,
    metadata,
  })

  return match
}

/**
 * Validates and records a new match from players, outcome, and metadata. Updates players' scores.
 * @param team_player_ids list of player ids for each team
 * @param outcome relative team scores
 */
export async function createAndScoreMatch(
  app: App,
  ranking: Ranking,
  team_players: MatchPlayer[][],
  outcome: number[],
  time_started?: Date,
  time_finished?: Date,
  metadata?: MatchMetadata,
): Promise<Match> {
  validateMatchData({
    ranking_id: ranking.data.id,
    team_players,
    outcome,
    metadata,
    time_started,
    time_finished,
  })

  await ensurePlayersEnabled(
    app,
    team_players.flat().map(p => p.player),
    ranking,
  )

  const match = await app.db.matches.create({
    ranking,
    team_players,
    outcome,
    metadata,
    time_started,
    time_finished,
    status: MatchStatus.Scored,
  })

  const scored_match = scoreMatch(app, match, team_players, ranking)

  return scored_match
}

export async function ensureNoActiveMatches(
  app: App,
  player_ids: number[],
  ranking_id: number,
): Promise<void> {
  sentry.debug(`ensureNoActiveMatches: players ${player_ids} in ranking ${ranking_id}`)
  // check if players are already in an active match
  const active_matches = await app.db.matches.getMany({
    player_ids: player_ids,
    ranking_ids: [ranking_id],
    status: MatchStatus.Ongoing,
  })

  if (active_matches.length > 0) {
    throw new UserErrors.OngoingMatchEror(
      `Finish the following match${active_matches.length === 1 ? `` : `es`} before starting a new one:` +
        `\n` +
        (
          await Promise.all(
            active_matches.map(async m => {
              return (
                `\`${m.match.data.id}\`` +
                (m.match.data.ongoing_match_channel_id
                  ? `: <#${m.match.data.ongoing_match_channel_id}>`
                  : ``)
              )
            }),
          )
        ).join(`\n`),
    )
  }
}

export async function ensurePlayersEnabled(
  app: App,
  players: Player[],
  ranking: Ranking,
): Promise<void> {
  sentry.debug(`ensurePlayersEnabled: players ${players} in ranking ${ranking}`)
  const disabled_players = players.filter(p => p.data.flags & PlayerFlags.Disabled)
  if (disabled_players.length > 0) {
    throw new UserError(
      disabled_players.map(p => `<@${p.data.user_id}>`).join(', ') +
        ` cannot participate in ${ranking.data.name}`,
    )
  }
}
