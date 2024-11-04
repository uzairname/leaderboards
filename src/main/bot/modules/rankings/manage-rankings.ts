import { Guild, GuildRanking, Ranking } from '../../../../database/models'
import { GuildRankingDisplaySettings } from '../../../../database/models/guildrankings'
import {
  MatchmakingSettings,
  PartialRanking,
  RankingInsert,
  RankingUpdate,
  Rating,
} from '../../../../database/models/rankings'
import { DeferContext } from '../../../../discord-framework'
import { sentry } from '../../../../logging/sentry'
import { App } from '../../../app/App'
import { UserError, UserErrors } from '../../errors/UserError'
import {
  syncGuildRankingLbMessage,
  syncRankingLbMessages,
} from '../leaderboard/leaderboard-message'

export const default_teams_per_match = 2
export const default_players_per_team = 1
export const default_best_of = 1

export const default_initial_rating: Rating = {
  mu: 50,
  rd: 50 / 3,
}

export const default_display_settings: GuildRankingDisplaySettings = {
  log_matches: true,
  leaderboard_message: true,
}
export const default_matchmaking_settings: MatchmakingSettings = {
  queue_enabled: true,
  direct_challenge_enabled: true,
}

export const max_ranking_name_length = 48
export const max_teams_per_match = 4
export const max_players_per_team = 12

/**
 *
 * @param app
 * @param guild The guild creating the ranking
 * @param lb_options The new ranking's options
 * @returns
 */
export async function createNewRankingInGuild(
  app: App,
  guild: Guild,
  options: {
    name: string
    teams_per_match?: number
    players_per_team?: number
    initial_rating?: Rating
    display_settings?: GuildRankingDisplaySettings
    matchmaking_settings?: MatchmakingSettings
  },
): Promise<{
  new_guild_ranking: GuildRanking
  new_ranking: Ranking
}> {
  validateRankingOptions(options)

  // make sure a ranking from this guild with the same name doesn't already exist
  const same_name_ranking = await app.db.guild_rankings.getByName(guild.data.id, options.name)
  if (same_name_ranking) {
    throw new UserError(`This server already has a ranking called \`${options.name}\``)
  }

  const new_ranking = await app.db.rankings.create({
    name: options.name,
    players_per_team: options.players_per_team || default_players_per_team,
    teams_per_match: options.teams_per_match || default_teams_per_match,
    initial_rating: options.initial_rating || default_initial_rating,
    matchmaking_settings: options.matchmaking_settings || default_matchmaking_settings,
  })

  const new_guild_ranking = await app.db.guild_rankings.create(guild, new_ranking, {
    is_admin: true,
    display_settings: options.display_settings || default_display_settings,
  })

  await syncRankingLbMessages(app, new_ranking)

  app.syncDiscordCommands(guild)

  return { new_guild_ranking, new_ranking }
}

export async function updateRanking(
  app: App,
  ranking: PartialRanking,
  options: RankingUpdate,
  ctx?: DeferContext<any>,
): Promise<void> {
  validateRankingOptions(options)
  await ranking.update(options)
  const guild_rankings = await app.db.guild_rankings.fetch({ ranking_id: ranking.data.id })

  for (const item of guild_rankings) {
    sentry.debug('item.guildranking', item.guild_ranking)
    if (options.name || options.matchmaking_settings) {
      await app.syncDiscordCommands(item.guild)
    }

    sentry.debug(item.guild_ranking)
    await syncGuildRankingLbMessage(app, item.guild_ranking)
  }

  // const result = await Promise.all(
  //   guild_rankings.map(item =>
  //     Promise.all([
  //       (async () => {
  //         if (options.name || options.matchmaking_settings) {
  //           await app.syncDiscordCommands(item.guild)
  //         }
  //       })(),
  //       syncGuildRankingLbMessage(app, item.guild_ranking),
  //     ]),
  //   ),
  // )
}

export async function deleteRanking(app: App, ranking: Ranking): Promise<void> {
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
      app.syncDiscordCommands(item.guild)
    }),
  )
}

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
      throw new UserErrors.ValidationError(
        `Number of teams must be between 2 and ${max_teams_per_match}`,
      )
  }

  if (o.players_per_team !== undefined) {
    if (!o.players_per_team || isNaN(o.players_per_team))
      throw new UserErrors.ValidationError(`Players per team must be a number`)
    if (o.players_per_team < 1 || o.players_per_team > max_players_per_team)
      throw new UserErrors.ValidationError(
        `Players per team must be between 1 and ${max_players_per_team}`,
      )
  }

  if (o.matchmaking_settings !== undefined) {
    if (o.matchmaking_settings.default_best_of !== undefined) {
      if (!o.matchmaking_settings.default_best_of ||
          isNaN(o.matchmaking_settings.default_best_of) ||
          o.matchmaking_settings.default_best_of < 1 ||
          o.matchmaking_settings.default_best_of % 2 == 0)
        throw new UserErrors.ValidationError(`Best of must be a positive odd number`)
    }

  }
}
