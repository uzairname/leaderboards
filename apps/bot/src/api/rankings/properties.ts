import {
  GuildRanking,
  GuildRankingDisplaySettings,
  MatchmakingSettings,
  PartialGuild,
  PartialGuildRanking,
  Ranking,
  RankingInsert,
  RatingStrategy,
} from '@repo/db/models'
import { UserError, UserErrors } from '../../errors/user-errors'
import { App } from '../../setup/app'
import { messageLink } from '@discordjs/builders'
import { Colors } from '../utils'

// Ranking Config
export const MAX_GUILD_RANKINGS = 24

// General Defaults
export const DEFAULT_TEAMS_PER_MATCH = 2
export const DEFAULT_PLAYERS_PER_TEAM = 1

export const DEFAULT_LB_COLOR = Colors.Primary

// Display Settings
export const default_display_settings: GuildRankingDisplaySettings = {
  log_matches: true,
  leaderboard_message: true,
  color: 16762997,
}

// Match Settings
export const default_best_of = 1
export const default_matchmaking_settings: MatchmakingSettings = {
  queue_enabled: true,
  direct_challenge_enabled: true,
  default_best_of: default_best_of,
}

// Limits
export const max_guild_rankings = 25
export const max_ranking_name_length = 48
export const max_teams_per_match = 4
export const max_players_per_team = 12

/**
 * Fills in the properties of a ranking with defaults, and
 * determine additional properties based on existing properties.
 */
export function rankingProperties(r: Ranking) {
  const rating_strategy = r.data.rating_settings.rating_strategy
  return {
    // Matches are a best of this, unless otherwise specified
    default_best_of: r.data.matchmaking_settings.default_best_of ?? default_best_of,
    tracks_best_of: rating_strategy === RatingStrategy.TrueSkill,
    // based on displayRatingFn
    uses_display_sd_offset: rating_strategy === RatingStrategy.TrueSkill,
    uses_provisional_ratings: rating_strategy === RatingStrategy.TrueSkill,
  }
}

export async function isQueueEnabled(guild_ranking: PartialGuildRanking) {
  // TODO: Add guild_ranking.data.matchmaking_settings.queue_enabled property
  const gr = await guild_ranking.fetch()
  return gr.ranking.data.matchmaking_settings.queue_enabled === true
}

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
 * Validates ranking options for update or creation
 * @param o Validates whichever ranking options are not undefined in o
 */
export function validateRankingOptions(o: Partial<RankingInsert>): void {
  if (undefined !== o.name) {
    if (o.name.length > max_ranking_name_length)
      throw new UserError(`Ranking names must be ${max_ranking_name_length} characters or less`)
    if (o.name.length == 0) throw new UserError(`Ranking name cannot be empty`)
  }

  if (undefined !== o.teams_per_match) {
    if (!o.teams_per_match || isNaN(o.teams_per_match))
      throw new UserErrors.ValidationError(`Number of teams must be a number`)

    if (o.teams_per_match < 2 || o.teams_per_match > max_teams_per_match)
      throw new UserErrors.ValidationError(`Number of teams must be between 2 and ${max_teams_per_match}`)
  }

  if (undefined !== o.players_per_team) {
    if (!o.players_per_team || isNaN(o.players_per_team))
      throw new UserErrors.ValidationError(`Players per team must be a number`)
    if (o.players_per_team < 1 || o.players_per_team > max_players_per_team)
      throw new UserErrors.ValidationError(`Players per team must be between 1 and ${max_players_per_team}`)
  }

  if (undefined !== o.matchmaking_settings) {
    if (undefined !== o.matchmaking_settings.default_best_of) {
      if (
        !o.matchmaking_settings.default_best_of ||
        isNaN(o.matchmaking_settings.default_best_of) ||
        o.matchmaking_settings.default_best_of < 1 ||
        o.matchmaking_settings.default_best_of % 2 == 0
      )
        throw new UserErrors.ValidationError(`Best of must be a positive odd number`)
    }
  }
}

/**
 * Get all of the rankings in the guild that have direct challenges enabled
 */
export async function getChallengeEnabledRankings(app: App, guild: PartialGuild) {
  const guild_rankings = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })

  const result = guild_rankings.filter(r => {
    return r.ranking.data.matchmaking_settings.direct_challenge_enabled
  })

  return result
}
