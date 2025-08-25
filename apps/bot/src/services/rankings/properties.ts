import { messageLink } from '@discordjs/builders'
import { GuildRanking, GuildRankingDisplaySettings, MatchSettings, OutcomeType, PartialGuild } from '@repo/db/models'
import { App } from '../../setup/app'
import { Colors } from '../utils/strings'

// Ranking Config
export const MAX_GUILD_RANKINGS = 24

// General Defaults
export const DEFAULT_TEAMS_PER_MATCH = 2
export const DEFAULT_PLAYERS_PER_TEAM = 1

export const DEFAULT_Q_JOIN_TIMEOUT_MINUTES = 5

export const DEFAULT_LB_COLOR = Colors.Primary

// Display Settings
export const default_display_settings: GuildRankingDisplaySettings = {
  log_matches: true,
  leaderboard_message: true,
  color: 16762997,
}

// Limits
export const max_guild_rankings = 25
export const max_ranking_name_length = 48
export const max_teams_per_match = 25
export const max_ffa_teams_per_match = 128
export const max_players_per_team = 25

/**
 * Returns the link to the live leaderboard message if it is enabled.
 * If it doesn't exist but is enabled, creates it again.
 */
export function liveLbMsgLink(guild_ranking: GuildRanking): string | undefined {
  return guild_ranking.data.leaderboard_channel_id &&
    guild_ranking.data.leaderboard_message_id &&
    guild_ranking.data.display_settings?.leaderboard_message
    ? messageLink(
        guild_ranking.data.leaderboard_channel_id,
        guild_ranking.data.leaderboard_message_id,
        guild_ranking.data.guild_id,
      )
    : undefined
}

/**
 * Get all of the rankings in the guild that have direct challenges enabled
 * and are 1v1
 */
export async function get1v1ChallengeEnabledRankings(app: App, guild: PartialGuild) {
  const guild_rankings = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })

  const result = guild_rankings.filter(r => {
    const props = app.rankings.getProperties(r.ranking)
    return (
      props.matchmaking_settings.direct_challenge_enabled && props.players_per_team === 1 && props.teams_per_match === 2
    )
  })

  return result
}

export const outcome_type_name = {
  [OutcomeType.Points]: `Points`,
  [OutcomeType.Ranks]: `Ranks`,
  [OutcomeType.WinLossDraw]: `Win or loss`,
}

export const default_match_settings: Required<MatchSettings> = {
  draws_allowed: false,
  outcome_type: OutcomeType.WinLossDraw,
}

export function matchTypeName(teams_per_match: number, players_per_team: number) {
  return teams_per_match <= 8
    ? new Array(teams_per_match).fill(players_per_team).join('v')
    : `${teams_per_match} ${players_per_team > 1 ? `x ${players_per_team}-Player Team` : `Player`} FFA`
}
