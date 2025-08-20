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
import { AnyDeferredContext } from '@repo/discord'
import { fillDefaults } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { UserError } from '../../errors/user-errors'
import { App, syncDiscordCommands } from '../../setup/app'
import { getOrAddGuild } from '../guilds/manage'
import { syncGuildRankingLbMessage, syncRankingLbMessages } from '../leaderboard/manage'
import { syncMatchesChannel } from '../matches/logging/matches-channel'
import { rescoreAllMatches } from '../matches/scoring/score-matches'
import {
  default_display_settings,
  default_matchmaking_settings,
  DEFAULT_PLAYERS_PER_TEAM,
  DEFAULT_TEAMS_PER_MATCH,
  MAX_GUILD_RANKINGS,
  validateRankingOptions,
} from './properties'
import { DEFAULT_RATING_STRATEGY, getDefaultRatingSettings } from './ratings'
import { GuildAuth, ensureGuildAdminPerms } from '../perms'

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
  auth: GuildAuth,
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
  app.logger.log({message: `createNewRankingInGuild`, category: 'appmethod'})
  await ensureGuildAdminPerms(app, auth)

  validateRankingOptions(options)

  // Update the match logs channel if needed
  const guild = await getOrAddGuild(app, guild_id)
  await syncMatchesChannel(app, guild)

  // make sure there are not too many rankings in this guild
  const guild_rankings = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })
  if (guild_rankings.length >= MAX_GUILD_RANKINGS) {
    throw new UserError(`This server already has the maximum number of rankings (${MAX_GUILD_RANKINGS})`)
  }

  // Make the name is unique in this guild
  const same_name_ranking = guild_rankings.find(r => r.ranking.data.name === options.name)
  if (same_name_ranking) {
    throw new UserError(`This server already has a ranking called \`${options.name}\``)
  }

  // Create the ranking
  const rating_settings = getDefaultRatingSettings(options.rating_strategy ?? DEFAULT_RATING_STRATEGY)
  const new_ranking = await app.db.rankings.create({
    name: options.name,
    players_per_team: options.players_per_team || DEFAULT_PLAYERS_PER_TEAM,
    teams_per_match: options.teams_per_match || DEFAULT_TEAMS_PER_MATCH,
    rating_settings,
    matchmaking_settings: fillDefaults(options.matchmaking_settings, default_matchmaking_settings),
  })

  const new_guild_ranking = await app.db.guild_rankings.create(guild, new_ranking, {
    is_admin: true,
    display_settings: options.display_settings || default_display_settings,
  })

  await syncRankingLbMessages(app, new_ranking)

  syncDiscordCommands(app, guild)

  return { guild_ranking: new_guild_ranking, ranking: new_ranking }
}

/**
 * Updates the ranking with the given options in the database.
 * Syncs all leaderboard messages. Syncs commands if applicable. Re-scores all matches if specified
 */
export async function updateRanking(
  app: App,
  auth: GuildAuth,
  ranking: PartialRanking,
  update: RankingUpdate,
  ctx?: AnyDeferredContext,
): Promise<void> {  
  app.logger.log({message: `updateRanking`, category: 'appmethod'})


  await ensureGuildAdminPerms(app, auth)
  validateRankingOptions(update)
  await ranking.update(update)

  app.logger.offload(async () => {
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
      await rescoreAllMatches(app, full_ranking, ctx) // This also syncs the leaderboard messages
    } else if (need_update_lb_messages) {
      syncRankingLbMessages(app, ranking)
    }

  }, undefined, 'after-update-ranking')
}

export async function updateGuildRanking(
  app: App,
  auth: GuildAuth,
  guild_ranking: GuildRanking,
  options: GuildRankingUpdate,
): Promise<void> {
  app.logger.log({message: `updateGuildRanking`, category: 'appmethod'})

  await ensureGuildAdminPerms(app, auth)
  await guild_ranking.update(options)
  await Promise.all([syncDiscordCommands(app, guild_ranking.guild), syncGuildRankingLbMessage(app, guild_ranking)])
}

export async function deleteRanking(app: App, auth: GuildAuth, ranking: PartialRanking): Promise<void> {
  app.logger.log({message: `deleteRanking`, category: 'appmethod'})

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
