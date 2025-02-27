import {
  GuildRankingDisplaySettings,
  MatchmakingSettings,
  PartialGuild,
  PartialGuildRanking,
  Ranking,
  RankingInsert,
  Rating,
  RatingSettings,
  RatingStrategy,
} from '@repo/db/models'
import { UserError, UserErrors } from '../../errors/user-errors'
import { App } from '../../setup/app'
import { messageLink } from '../../utils'
import { syncGuildRankingLbMessage } from '../leaderboard/leaderboard-message'

// General Defaults
export const default_teams_per_match = 2
export const default_players_per_team = 1

// Rating Settings
export const default_rating_strategy = RatingStrategy.TrueSkill
export const default_k_factor = 32
export const trueskill_default_initial_rating = {
  mu: 50,
  rd: 50 / 3,
}

/**
 * Maps rating methods to their settings. When a ranking is created or updated with
 * a rating method, the settings are filled in with the defaults from this map.
 */
export const rating_strategy_to_rating_settings: Record<RatingStrategy, RatingSettings> = {
  [RatingStrategy.WinsMinusLosses]: {
    rating_strategy: RatingStrategy.WinsMinusLosses,
    initial_rating: {
      mu: 0,
    },
  },
  [RatingStrategy.TrueSkill]: {
    rating_strategy: RatingStrategy.TrueSkill,
    initial_rating: trueskill_default_initial_rating,
  },
  [RatingStrategy.Elo]: {
    rating_strategy: RatingStrategy.Elo,
    initial_rating: {
      mu: 1500,
      rd: 400,
    },
    k_factor: default_k_factor,
  },
}

// Display Settings
export const default_display_settings: GuildRankingDisplaySettings = {
  log_matches: true,
  leaderboard_message: true,
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

export function displayRatingFn(
  app: App,
  ranking: Ranking,
): (rating: Rating) => { rating: number; is_provisional?: boolean } {
  const rating_settings = ranking.data.rating_settings
  return rating => {
    if (rating_settings.rating_strategy === RatingStrategy.WinsMinusLosses) {
      return {
        rating: rating.mu,
      }
    } else if (rating_settings.rating_strategy === RatingStrategy.Elo) {
      return {
        rating: Math.max(0, Math.round(rating.mu * (app.config.DisplayMeanRating / rating_settings.initial_rating.mu))),
      }
    } else if (rating_settings.rating_strategy === RatingStrategy.TrueSkill) {
      const initial_rating = rating_settings.initial_rating.rd ?? trueskill_default_initial_rating.rd
      const player_rd = rating.rd ?? initial_rating

      return {
        rating: Math.max(
          0,
          Math.round(
            (rating.mu + app.config.DisplaySdOffset * player_rd) *
              (app.config.DisplayMeanRating / rating_settings.initial_rating.mu),
          ),
        ),
        is_provisional: player_rd > initial_rating * app.config.ProvisionalRdThreshold,
      }
    } else {
      throw new Error(`Unexpected rating method: ${rating_settings.rating_strategy}`)
    }
  }
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

export const rating_strategy_desc = {
  [RatingStrategy.WinsMinusLosses]: `Wins - Losses`,
  [RatingStrategy.TrueSkill]: `TrueSkill2`,
  [RatingStrategy.Elo]: `Elo`,
}
/**
 * Get all of the rankings in the guild that have direct challenges enabled
 */

export async function getChallengeEnabledRankings(app: App, guild: PartialGuild) {
  const guild_rankings = await app.db.guild_rankings.fetchBy({ guild_id: guild.data.id })

  const result = guild_rankings.filter(r => {
    return r.ranking.data.matchmaking_settings.direct_challenge_enabled
  })

  return result
} /**
 * Returns a function that maps a player's rating to a number to display as their rating.
 * The function offsets the rating by a constant amount of standard deviations if enabled by the rating method.
 * Determines if the rating is provisional.
 */
