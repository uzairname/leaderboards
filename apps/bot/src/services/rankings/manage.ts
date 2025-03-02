import {
  GuildRanking,
  GuildRankingDisplaySettings,
  GuildRankingUpdate,
  MatchmakingSettings,
  PartialRanking,
  Ranking,
  RankingUpdate,
  RatingSettings,
  RatingStrategy,
} from '@repo/db/models'
import { fillDefaults } from '@repo/utils'
import { UserError } from '../../errors/user-errors'
import { sentry } from '../../logging/sentry'
import { App } from '../../setup/app'
import { getOrAddGuild } from '../guilds/manage-guilds'
import { syncGuildRankingLbMessage, syncRankingLbMessages } from '../leaderboard/manage'
import { syncMatchesChannel } from '../matches/logging/matches-channel'
import {
  default_display_settings,
  default_matchmaking_settings,
  default_players_per_team,
  default_rating_strategy,
  default_teams_per_match,
  rating_strategy_to_rating_settings,
  validateRankingOptions,
} from './properties'

/**
 * Creates a new ranking and adds it to the guild
 * Registers the guild and syncs its matches channel.
 * Syncs the guild's commands.
 * @param app
 * @param guild_id The guild creating the ranking
 * @param options The new ranking's options
 * @returns
 */
export async function createNewRankingInGuild(
  app: App,
  guild_id: string,
  options: {
    // Ranking options
    name: string
    teams_per_match?: number
    players_per_team?: number
    rating_strategy?: RatingStrategy
    // Guild ranking options
    matchmaking_settings?: MatchmakingSettings
    display_settings?: GuildRankingDisplaySettings
    rating_settings?: RatingSettings
  },
): Promise<{
  guild_ranking: GuildRanking
  ranking: Ranking
}> {
  const guild = await getOrAddGuild(app, guild_id)
  await syncMatchesChannel(app, guild)
  validateRankingOptions(options)

  // make sure there are less than 25 rankings in this guild
  const guild_rankings = await app.db.guild_rankings.fetchBy({ guild_id: guild.data.id })
  if (guild_rankings.length >= 25) {
    throw new UserError('This server already has the maximum number of rankings (25)')
  }

  // make sure a ranking from this guild with the same name doesn't already exist
  const same_name_ranking = guild_rankings.find(r => r.ranking.data.name === options.name)
  if (same_name_ranking) {
    throw new UserError(`This server already has a ranking called \`${options.name}\``)
  }

  const rating_settings = rating_strategy_to_rating_settings[options.rating_strategy ?? default_rating_strategy]

  const new_ranking = await app.db.rankings.create({
    name: options.name,
    players_per_team: options.players_per_team || default_players_per_team,
    teams_per_match: options.teams_per_match || default_teams_per_match,
    rating_settings,
    matchmaking_settings: fillDefaults(options.matchmaking_settings, default_matchmaking_settings),
  })

  const new_guild_ranking = await app.db.guild_rankings.create(guild, new_ranking, {
    is_admin: true,
    display_settings: options.display_settings || default_display_settings(),
  })

  await syncRankingLbMessages(app, new_ranking)

  app.syncDiscordCommands(guild)

  return { guild_ranking: new_guild_ranking, ranking: new_ranking }
}

export async function updateRanking(app: App, ranking: PartialRanking, options: RankingUpdate): Promise<void> {
  validateRankingOptions(options)
  await ranking.update(options)
  const guild_rankings = await app.db.guild_rankings.fetchBy({ ranking_id: ranking.data.id })

  for (const item of guild_rankings) {
    if (options.name || options.matchmaking_settings) {
      app.syncDiscordCommands(item.guild)
    }

    sentry.debug(item.guild_ranking)
    await syncGuildRankingLbMessage(app, item.guild_ranking)
  }
}

export async function updateGuildRanking(
  app: App,
  guild_ranking: GuildRanking,
  options: GuildRankingUpdate,
): Promise<void> {
  await guild_ranking.update(options)
  app.syncDiscordCommands(guild_ranking.guild)
  await syncGuildRankingLbMessage(app, guild_ranking)
}

export async function deleteRanking(app: App, ranking: PartialRanking): Promise<void> {
  const guild_rankings = await app.db.guild_rankings.fetchBy({ ranking_id: ranking.data.id })
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
