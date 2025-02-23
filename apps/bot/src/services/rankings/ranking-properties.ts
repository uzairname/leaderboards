import {
  GuildRankingDisplaySettings,
  MatchmakingSettings,
  PartialGuildRanking,
  Ranking,
  RankingInsert,
  Rating,
  RatingSettings,
  ScoringMethod,
} from '@repo/db/models'
import { UserError, UserErrors } from '../../errors/user-errors'

export const default_teams_per_match = 2
export const default_players_per_team = 1
export const default_initial_rating: Rating = {
  mu: 50,
  rd: 50 / 3,
}
export const default_rating_settings: RatingSettings = {
  scoring_method: ScoringMethod.TrueSkill,
  initial_rating: default_initial_rating,
}
export const default_display_settings: GuildRankingDisplaySettings = {
  log_matches: true,
  leaderboard_message: true,
}
export const default_best_of = 1
export const default_matchmaking_settings: MatchmakingSettings = {
  queue_enabled: true,
  direct_challenge_enabled: true,
  default_best_of: default_best_of,
}
export const max_ranking_name_length = 48
export const max_teams_per_match = 4
export const max_players_per_team = 12

/**
 * Fills in the properties of a ranking with defaults.
 */
export function rankingProperties(r: Ranking) {
  return {
    default_best_of: r.data.matchmaking_settings.default_best_of ?? default_best_of,
  }
}

/**
 * Fills in the properties of a guild ranking with defaults
 */
export async function isQueueEnabled(guild_ranking: PartialGuildRanking) {
  // TODO: Add guild_ranking.data.matchmaking_settings.queue_enabled property

  // if (gr.guild_ranking.data.matchmaking_settings.queue_enabled !== undefined) {
  //     return gr.guild_ranking.data.matchmaking_settings.queue_enabled
  // } else {
  // }

  const gr = await guild_ranking.fetch()
  return gr.ranking.data.matchmaking_settings.queue_enabled === true
}

/**
 * Validates ranking options for update or creation
 * @param o Validates whichever ranking options are not undefined in o
 */

export function validateRankingOptions(o: Partial<RankingInsert>): void {
  if (o.name !== undefined) {
    if (o.name.length > max_ranking_name_length)
      throw new UserError(`Ranking names must be ${max_ranking_name_length} characters or less`)
    if (o.name.length == 0) throw new UserError(`Ranking name cannot be empty`)
  }

  if (o.teams_per_match !== undefined) {
    if (!o.teams_per_match || isNaN(o.teams_per_match))
      throw new UserErrors.ValidationError(`Number of teams must be a number`)

    if (o.teams_per_match < 2 || o.teams_per_match > max_teams_per_match)
      throw new UserErrors.ValidationError(`Number of teams must be between 2 and ${max_teams_per_match}`)
  }

  if (o.players_per_team !== undefined) {
    if (!o.players_per_team || isNaN(o.players_per_team))
      throw new UserErrors.ValidationError(`Players per team must be a number`)
    if (o.players_per_team < 1 || o.players_per_team > max_players_per_team)
      throw new UserErrors.ValidationError(`Players per team must be between 1 and ${max_players_per_team}`)
  }

  if (o.matchmaking_settings !== undefined) {
    if (o.matchmaking_settings.default_best_of !== undefined) {
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
