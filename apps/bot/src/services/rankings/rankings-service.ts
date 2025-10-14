import {
  GuildRanking,
  GuildRankingDisplaySettings,
  GuildRankingUpdate,
  MatchmakingSettings,
  MatchSettings,
  OutcomeType,
  PartialGuildRanking,
  PartialRanking,
  Ranking,
  RankingInsert,
  RankingUpdate,
  RatingParameters,
  RatingStrategy,
} from '@repo/db/models'
import { AnyDeferredContext } from '@repo/discord'
import { cleanString, fillDefaults } from '@repo/utils'
import z from 'zod/v4'
import { UserError, UserErrors } from '../../errors/user-errors'
import { App, offload, syncDiscordCommands } from '../../setup/app'
import { syncMatchesChannel } from '../matches/logging/matches-channel'
import { rating_strategies, ratingStrategyToScorer } from '../matches/scoring/scorer'
import { ensureGuildAdminPerms, GuildAuth, hasAdminPerms } from '../perms'
import { AppService, LogMethods } from '../service'
import { escapeMd } from '../utils/strings'
import {
  default_display_settings,
  default_match_settings,
  DEFAULT_PLAYERS_PER_TEAM,
  DEFAULT_Q_JOIN_TIMEOUT_MINUTES,
  DEFAULT_TEAMS_PER_MATCH,
  matchTypeName,
  MAX_GUILD_RANKINGS,
  max_players_per_team,
  max_ranking_name_length,
  max_teams_per_match,
} from './properties'
import { DEFAULT_RATING_STRATEGY, ELO_DEFAULT, GLICKO_DEFAULT, TRUESKILL_DEFAULT } from './ratings'

@LogMethods
export class RankingsService extends AppService {
  /**
   * Creates a new ranking and adds it to the guild
   * Registers the guild and syncs its matches channel.
   * Syncs the guild's commands.
   * @param app
   * @param guild_id The guild creating the ranking
   * @param options The new ranking's options
   * @returns
   */
  async createInGuild(
    app: App,
    auth: GuildAuth,
    guild_id: string,
    options: {
      // Ranking options
      name: string
      teams_per_match?: number
      players_per_team?: number
      matchmaking_settings?: MatchmakingSettings
      rating_settings?: RatingParameters
      match_settings?: MatchSettings

      // Guild ranking options
      display_settings?: GuildRankingDisplaySettings
    },
  ): Promise<{
    guild_ranking: GuildRanking
    ranking: Ranking
  }> {
    await ensureGuildAdminPerms(app, auth)

    this.validateRankingOptions(options)

    // Update the match logs channel if needed
    const guild = await app.guilds.get(app, guild_id)
    await syncMatchesChannel(app, guild)

    // make sure there are not too many rankings in this guild
    const guild_rankings = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })
    if (guild_rankings.length >= MAX_GUILD_RANKINGS) {
      throw new UserError(`This server already has the maximum number of rankings (${MAX_GUILD_RANKINGS})`)
    }

    // Make the name is unique in this guild
    const same_name_ranking = guild_rankings.find(r => cleanString(r.ranking.data.name) === cleanString(options.name))
    if (same_name_ranking) {
      throw new UserError(
        `The name "${options.name}" conflicts with the existing ranking "${same_name_ranking.ranking.data.name}"`,
      )
    }

    const match_settings = options.match_settings ?? default_match_settings
    const rating_settings =
      options.rating_settings ??
      this.getDefaultRatingSettings(
        this.getDefaultRatingStrategy(match_settings, options.players_per_team, options.teams_per_match),
      )

    // Create the ranking
    const new_ranking = await app.db.rankings.create({
      name: options.name,
      players_per_team: options.players_per_team || DEFAULT_PLAYERS_PER_TEAM,
      teams_per_match: options.teams_per_match || DEFAULT_TEAMS_PER_MATCH,
      matchmaking_settings: options.matchmaking_settings,
      rating_settings,
      match_settings,
    })

    const new_guild_ranking = await app.db.guild_rankings.create(guild, new_ranking, {
      is_admin: true,
      display_settings: options.display_settings || default_display_settings,
    })

    await app.lbs.syncMessages(app, new_ranking)

    syncDiscordCommands(app, guild)

    return { guild_ranking: new_guild_ranking, ranking: new_ranking }
  }

  /**
   * Source of truth for the properties of a ranking.
   * This is used to fill in defaults and determine additional properties.
   *
   * @param ranking The ranking to get the properties for
   * @returns The properties of the ranking
   */
  getProperties(ranking: Ranking) {
    const default_matchmaking_settings: Omit<Required<MatchmakingSettings>, 'queue_join_ping_role_id'> = {
      queue_enabled: true,
      queue_join_timeout_minutes: DEFAULT_Q_JOIN_TIMEOUT_MINUTES,
      direct_challenge_enabled: true,
      default_best_of: 1,
    }

    const default_rating_settings = this.getDefaultRatingSettings(
      ranking.data.rating_settings.rating_strategy ?? DEFAULT_RATING_STRATEGY,
    )

    const data = {
      players_per_team: ranking.data.players_per_team ?? DEFAULT_PLAYERS_PER_TEAM,
      teams_per_match: ranking.data.teams_per_match ?? DEFAULT_TEAMS_PER_MATCH,
      rating_params: fillDefaults(ranking.data.rating_settings, default_rating_settings),
      matchmaking_settings: fillDefaults(ranking.data.matchmaking_settings ?? {}, default_matchmaking_settings),
      match_settings: fillDefaults(ranking.data.match_settings ?? {}, default_match_settings),
    }

    const match_type_name = matchTypeName(data.teams_per_match, data.players_per_team)

    const uses_rd =
      data.rating_params.rating_strategy === RatingStrategy.TrueSkill ||
      data.rating_params.rating_strategy === RatingStrategy.Glicko ||
      data.rating_params.rating_strategy === RatingStrategy.Bayesian

    const uses_provisional_ratings =
      data.rating_params.rating_strategy === RatingStrategy.TrueSkill ||
      data.rating_params.rating_strategy === RatingStrategy.Glicko ||
      data.rating_params.rating_strategy === RatingStrategy.Bayesian

    return {
      ...data,
      uses_rd,
      uses_provisional_ratings,
      match_type_name,
    }
  }

  /**
   * Gets a compatible rating strategy for the given match settings, favoring
   * some over others
   */
  getDefaultRatingStrategy(
    match_settings: MatchSettings,
    players_per_team: number = DEFAULT_PLAYERS_PER_TEAM,
    teams_per_match: number = DEFAULT_TEAMS_PER_MATCH,
  ): RatingStrategy {
    const rating_strategies_ordered = [
      RatingStrategy.Bayesian,
      RatingStrategy.Glicko,
      RatingStrategy.TrueSkill,
      RatingStrategy.Elo,
      RatingStrategy.WinsMinusLosses,
    ]

    // If the default strategy is not supported, try to find another one
    for (const strategy of rating_strategies_ordered) {
      const scorer = ratingStrategyToScorer(strategy)
      const { is_supported } = scorer.isSupported(
        match_settings.outcome_type ?? OutcomeType.WinLossDraw,
        players_per_team,
        teams_per_match,
      )

      if (is_supported) {
        return strategy
      }
    }

    // If no strategy is supported, throw an error
    throw new UserError(
      `No compatible rating strategy found for the given match settings. Please check your match settings.`,
      `Incompatible Match Settings`,
    )
  }

  /**
   * Maps rating strategies to their default parameters. When a ranking is created or updated with
   * a rating method, the settings are filled in with the defaults from this map.
   */
  getDefaultRatingSettings(strategy: RatingStrategy): RatingParameters {
    const defaults = {
      [RatingStrategy.TrueSkill]: {
        initial_rating: {
          mu: TRUESKILL_DEFAULT.Mu,
          rd: TRUESKILL_DEFAULT.Rd,
        },
        tau: TRUESKILL_DEFAULT.Tau,
      },
      [RatingStrategy.Glicko]: {
        initial_rating: {
          mu: GLICKO_DEFAULT.Mu,
          rd: GLICKO_DEFAULT.Rd,
          vol: GLICKO_DEFAULT.Vol,
        },
        tau: GLICKO_DEFAULT.Tau,
      },
      [RatingStrategy.Elo]: {
        initial_rating: {
          mu: ELO_DEFAULT.Mu,
          rd: ELO_DEFAULT.Rd,
        },
      },
      [RatingStrategy.WinsMinusLosses]: {
        initial_rating: {
          mu: 0,
        },
      },
      [RatingStrategy.Bayesian]: {
        initial_rating: {
          mu: 1000,
          rd: 200,
        },
      },
    }[strategy]

    return {
      rating_strategy: strategy,
      initial_rating: {
        mu: defaults.initial_rating.mu,
        rd: defaults.initial_rating.rd ?? TRUESKILL_DEFAULT.Rd, // TrueSkill default
        vol: defaults.initial_rating.vol ?? GLICKO_DEFAULT.Vol, // Glicko default
      },
      k_factor: ELO_DEFAULT.K,
      tau: defaults.tau ?? GLICKO_DEFAULT.Tau, // Glicko default
      provisional_rd_threshold: 0.8,
    }
  }

  // GUILD RANKING PROPERTIES
  /**
   * Determines if the queue is enabled for the given guild ranking, based
   * on its ranking's settings
   */
  async isQueueEnabled(guild_ranking: PartialGuildRanking) {
    // TODO: Add guild_ranking.data.matchmaking_settings.queue_enabled property
    const gr = await guild_ranking.fetch()
    return gr.ranking.data.matchmaking_settings?.queue_enabled === true
  }

  /**
   * @returns The number of rankings in the guild
   */
  async numRankings(app: App, guild_id: string): Promise<number> {
    const items = await app.db.guild_rankings.fetch({ guild_id })
    return items.length
  }

  /**
   * Updates the ranking with the given options in the database.
   * Syncs all leaderboard messages. Syncs commands if applicable. Re-scores all matches if specified
   */
  async update(
    app: App,
    auth: GuildAuth,
    ranking: Ranking,
    update: RankingUpdate,
    ctx?: AnyDeferredContext,
  ): Promise<void> {
    await this.ensureRankingAdmin(app, auth, ranking)
    this.validateRankingOptions(update)
    await ranking.update(update)

    offload(
      app,
      async app => {
        // Queue and challenge commands are affected my matchmaking_setting
        const need_update_commands = !!update.name || !!update.matchmaking_settings

        // Rescore matches if the rating settings were changed
        const need_rescore_matches = !!update.rating_settings

        const need_update_lb_messages = need_rescore_matches || !!update.name

        if (need_update_commands) {
          const guild_rankings = await app.db.guild_rankings.fetch({ ranking_id: ranking.data.id })
          for (const item of guild_rankings) {
            if (update.name || update.matchmaking_settings) {
              app.logger.debug(`syncing commands for guild ${item.guild.data.id}`)
              await syncDiscordCommands(app, item.guild)
              app.logger.debug(`done`)
            }
          }
        }

        if (need_rescore_matches) {
          const full_ranking = await ranking.fetch()
          // This also syncs the leaderboard messages
          await app.scoring.rescoreAllMatches(app, full_ranking, ctx)
        } else if (need_update_lb_messages) {
          app.lbs.syncMessages(app, ranking)
        }
      },
      'after-update-ranking',
    )
  }

  async updateGuildRanking(
    app: App,
    auth: GuildAuth,
    guild_ranking: GuildRanking,
    options: GuildRankingUpdate,
  ): Promise<void> {
    await ensureGuildAdminPerms(app, auth)
    await guild_ranking.update(options)
    await Promise.all([
      syncDiscordCommands(app, guild_ranking.guild),
      app.lbs.syncGuildRankingMessage(app, guild_ranking),
    ])
  }

  async delete(app: App, auth: GuildAuth, ranking: PartialRanking): Promise<void> {
    await ensureGuildAdminPerms(app, auth)
    const guild_rankings = await app.db.guild_rankings.fetch({ ranking_id: ranking.data.id })
    await Promise.all(
      guild_rankings.map(async item => {
        await app.discord.deleteMessageIfExists(
          item.guild_ranking.data.leaderboard_channel_id,
          item.guild_ranking.data.leaderboard_message_id,
        )
      }),
    )
    await ranking.delete()

    await Promise.all(
      guild_rankings.map(async item => {
        syncDiscordCommands(app, item.guild)
      }),
    )
  }

  /**
   * Validates ranking options for update or creation
   * @param o Validates whichever ranking options are not undefined in o
   */
  validateRankingOptions(o: Partial<RankingInsert>, current_ranking?: Ranking): void {
    const current_properties = current_ranking ? this.getProperties(current_ranking) : undefined

    const RankingDataSchema = z.object({
      name: z.string().min(1).max(max_ranking_name_length).optional(),
      teams_per_match: z.number().int().gte(2).lte(max_teams_per_match).optional(),
      players_per_team: z.number().int().gte(1).lte(max_players_per_team).optional(),
      matchmaking_settings: z
        .object({
          default_best_of: z
            .number()
            .int()
            .gte(1)
            .refine(n => n % 2 === 1, {
              message: 'Best of must be a positive odd number',
            })
            .optional(),
          direct_challenge_enabled: z.boolean().optional(),
        })
        .optional(),
    })

    const result = RankingDataSchema.safeParse(o)
    if (!result.success) {
      throw new UserErrors.ValidationError(z.prettifyError(result.error))
    }

    // Validate rating strategy with match settings
    if (o.rating_settings?.rating_strategy !== undefined) {
      const outcome_type = o.match_settings?.outcome_type ?? current_properties?.match_settings.outcome_type
      const players_per_team = o.players_per_team ?? current_properties?.players_per_team
      const teams_per_match = o.teams_per_match ?? current_properties?.teams_per_match

      const scorer = ratingStrategyToScorer(o.rating_settings.rating_strategy)
      if (undefined !== outcome_type && undefined !== players_per_team && undefined !== teams_per_match) {
        const { is_supported, message } = scorer.isSupported(outcome_type, players_per_team, teams_per_match)

        if (!is_supported) {
          throw new UserErrors.ValidationError(
            message ?? `The rating strategy is not compatible with the ranking's match settings`,
            `Incompatible rating strategy`,
          )
        }
      }
    }
  }

  async getCompatibleRatingStrategies(ranking: Ranking) {
    const strategies = rating_strategies.filter(strategy => {
      const scorer = ratingStrategyToScorer(strategy)
      const outcome_type = ranking.data.match_settings?.outcome_type ?? OutcomeType.WinLossDraw
      const players_per_team = ranking.data.players_per_team ?? DEFAULT_PLAYERS_PER_TEAM
      const teams_per_match = ranking.data.teams_per_match ?? DEFAULT_TEAMS_PER_MATCH

      return scorer.isSupported(outcome_type, players_per_team, teams_per_match).is_supported
    })
    return strategies
  }

  /**
   * Determines whether the user has admin access to a ranking.
   *
   * If the user's current guild has admin permissions for the ranking, and the
   * user has bot admin permissions in that guild, returns true. Otherwise, returns false
   */
  async hasRankingAdminPerms(app: App, auth: GuildAuth, ranking: Ranking): Promise<boolean> {
    const guild_ranking = await app.db.guild_rankings.fetch({ guild_id: auth.guild_id, ranking_id: ranking.data.id })
    if (!guild_ranking?.guild_ranking.data.is_admin) return false

    if (!(await hasAdminPerms(app, auth))) return false

    return true
  }

  async ensureRankingAdmin(app: App, auth: GuildAuth, ranking: Ranking): Promise<void> {
    if (!(await this.hasRankingAdminPerms(app, auth, ranking))) {
      throw new UserError(
        `You need admin permissions for the ranking ${escapeMd(ranking.data.name)} to do this`,
        `Missing Permissions`,
      )
    }
  }
}
