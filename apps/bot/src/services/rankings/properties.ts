import {
  GuildRankingDisplaySettings,
  MatchmakingSettings,
  PartialGuild,
  PartialGuildRanking,
  Ranking,
  RankingInsert,
  Rating,
  RatingSettings,
  ScoringMethod,
} from '@repo/db/models'
import { UserError, UserErrors } from '../../errors/user-errors'
import { App } from '../../setup/app'
import { messageLink } from '../../utils'
import { syncGuildRankingLbMessage } from '../leaderboard/leaderboard-message'

// Defaults
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

// Limits
export const max_guild_rankings = 25
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

export async function isQueueEnabled(guild_ranking: PartialGuildRanking) {
  // TODO: Add guild_ranking.data.matchmaking_settings.queue_enabled property
  const gr = await guild_ranking.fetch()
  return gr.ranking.data.matchmaking_settings.queue_enabled === true
}

export function trackBestOf(scoring_method: ScoringMethod) {
  return scoring_method === ScoringMethod.TrueSkill
}

export function usesDisplaySdOffset(scoring_method: ScoringMethod) {
  return scoring_method === ScoringMethod.TrueSkill
}

/**
 * Returns the link to the live leaderboard message if it is enabled.
 * If it doesn't exist but is enabled, creates it again.
 */
export async function liveLbMsgLink(app: App, p_guild_ranking: PartialGuildRanking) {
  const { guild_ranking } = await p_guild_ranking.fetch()

  const lb_msg_result = await syncGuildRankingLbMessage(app, guild_ranking, {
    enable_if_disabled: false,
    no_edit: true,
  })

  return lb_msg_result
    ? messageLink(guild_ranking.data.guild_id, lb_msg_result.channel_id, lb_msg_result.message.id)
    : undefined
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

export const scoring_method_desc = {
  [ScoringMethod.WinsMinusLosses]: `Wins - Losses`,
  [ScoringMethod.TrueSkill]: `TrueSkill2`,
  [ScoringMethod.Elo]: `Elo`,
}
/**
 * Get all of the rankings in the guild that have direct challenges enabled
 */


export async function getChallengeEnabledRankings(app: App, guild: PartialGuild) {
  const guild_rankings = await app.db.guild_rankings.fetchBy({ guild_id: guild.data.id });

  const result = guild_rankings.filter(r => {
    return r.ranking.data.matchmaking_settings.direct_challenge_enabled;
  });

  return result;
}
