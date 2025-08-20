import { Guild, GuildRanking, PartialGuildRanking, PartialRanking, Ranking } from '@repo/db/models'
import { nonNullable } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import type { App } from '../../setup/app'
import { syncRankedCategory } from '../guilds/manage'
import { leaderboardMessage } from '../../interactions/leaderboard/pages'
import { GuildAuth, ensureGuildAdminPerms } from '../perms'
import { escapeMd } from '../utils'

export async function syncRankingLbMessages(app: App, ranking: PartialRanking): Promise<void> {
  app.logger.debug(`syncRankingLbMessages ${ranking}`)
  const guild_rankings = await app.db.guild_rankings.fetch({ ranking_id: ranking.data.id })
  await Promise.all(guild_rankings.map(guild_ranking => syncGuildRankingLbMessage(app, guild_ranking.guild_ranking)))
}

/**
 * Ensures that the guild ranking's leaderboard message exists and is up to date.
 * @param param2.enable_if_disabled If true, will update the guild ranking's config to enable the lb message.
 * If false, does nothing if the live leaderboard message is disabled.
 * @param param2.no_edit If true, will not edit the message if it already exists
 */
export async function syncGuildRankingLbMessage(
  app: App,
  p_guild_ranking: PartialGuildRanking,
  { enable_if_disabled = false, no_edit = false } = {},
): Promise<{ message: D.APIMessage; channel_id: string } | undefined> {
  app.logger.log({message: `syncGuildRankingLbMessage`, category: 'appmethod'})

  const { guild, ranking, guild_ranking } = await p_guild_ranking.fetch()

  if (!guild_ranking.data.display_settings?.leaderboard_message && !enable_if_disabled) return

  const message_data = (
    await leaderboardMessage(app, ranking, {
      guild_id: guild.data.id,
    })
  ).message

  const result = await app.discord.utils.syncChannelMessage({
    target_channel_id: guild_ranking.data.leaderboard_channel_id,
    target_message_id: guild_ranking.data.leaderboard_message_id,
    messageData: async () => message_data,
    getChannel: () => sendLbChannel(app, guild, ranking),
    no_edit,
  })

  if (result.is_new_message || result.new_channel) {
    await guild_ranking.update({
      leaderboard_channel_id: result.new_channel?.id ?? guild_ranking.data.leaderboard_channel_id,
      leaderboard_message_id: result.is_new_message ? result.message.id : undefined,
      display_settings: { ...guild_ranking.data.display_settings, leaderboard_message: true },
    })
  }

  return {
    message: result.message,
    channel_id:
      result.new_channel?.id ?? nonNullable(guild_ranking.data.leaderboard_channel_id, 'existing lb channel id'),
  }
}

export async function disableGuildRankingLbMessage(app: App, auth: GuildAuth, guild_ranking: GuildRanking) {
  await ensureGuildAdminPerms(app, auth)
  await Promise.all([
    app.discord.deleteMessageIfExists(
      guild_ranking.data.leaderboard_channel_id,
      guild_ranking.data.leaderboard_message_id,
    ),
    guild_ranking.update({
      display_settings: {
        ...guild_ranking.data.display_settings,
        leaderboard_message: false,
      },
    }),
  ])
}

async function sendLbChannel(app: App, guild: Guild, ranking: Ranking): Promise<D.APIChannel> {
  app.logger.log({message: `sendLbChannel`, category: 'appmethod'})

  const category = (await syncRankedCategory(app, guild)).channel
  return await app.discord.createGuildChannel(guild.data.id, {
    type: D.ChannelType.GuildText,
    parent_id: category.id,
    name: `${escapeMd(ranking.data.name)} Leaderboard`,
    topic: 'This leaderboard is displayed and updated live here',
    permission_overwrites: leaderboardChannelPermissionOverwrites(guild.data.id, app.discord.applicationId),
  })
}

function leaderboardChannelPermissionOverwrites(
  guild_id: string,
  application_id: string,
): D.RESTAPIChannelPatchOverwrite[] {
  return [
    {
      // @everyone can't send messages or make threads
      id: guild_id,
      type: 0,
      deny: (
        D.PermissionFlagsBits.SendMessages |
        D.PermissionFlagsBits.SendMessagesInThreads |
        D.PermissionFlagsBits.CreatePublicThreads |
        D.PermissionFlagsBits.CreatePrivateThreads
      ).toString(),
    },
    {
      // the bot can send messages and make public threads
      id: application_id,
      type: 1,
      allow: (
        D.PermissionFlagsBits.SendMessages |
        D.PermissionFlagsBits.SendMessagesInThreads |
        D.PermissionFlagsBits.CreatePublicThreads |
        D.PermissionFlagsBits.CreatePrivateThreads
      ).toString(),
    },
  ]
}
