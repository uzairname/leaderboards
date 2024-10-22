import * as D from 'discord-api-types/v10'
import { GuildChannelData, MessageData } from '../../../../discord-framework'
import { App } from '../../../context/app_context'
import type { Guild } from '../../../database/models'
import { Colors } from '../../common/constants'
import { commandMention } from '../../common/strings'
import { getOrUpdateRankedCategory } from '../guilds'
import { matches_command_signature } from './logging/views/commands/match_history_command'

export async function syncMatchesChannel(app: App, guild: Guild): Promise<D.APIChannel> {
  const sync_channel_result = await app.bot.utils.syncGuildChannel({
    target_channel_id: guild.data.matches_channel_id,
    channelData: async () => matchLogsChannelData(app, guild),
  })

  if (sync_channel_result.is_new_channel) {
    await Promise.all([
      app.bot.createMessage(
        sync_channel_result.channel.id,
        (await matchesChannelDescriptionMessageData(app, guild)).as_post,
      ),
      guild.update({
        matches_channel_id: sync_channel_result.channel.id,
      }),
    ])
  }
  return sync_channel_result.channel
}

async function matchesChannelDescriptionMessageData(app: App, guild: Guild): Promise<MessageData> {
  const matches_cmd_mention = await commandMention(app, matches_command_signature, guild.data.id)

  const msg = new MessageData({
    embeds: [
      {
        title: `Matches`,
        description:
          `Ranked matches in this server will be recorded in this channel.` +
          `\nTo view or manage a specific match, use ${matches_cmd_mention} \`<id>\``,
        color: Colors.EmbedBackground,
      },
    ],
  })

  return msg
}

async function matchLogsChannelData(
  app: App,
  guild: Guild,
): Promise<{
  guild_id: string
  data: GuildChannelData
}> {
  const category = (await getOrUpdateRankedCategory(app, guild)).channel
  return {
    guild_id: guild.data.id,
    data: new GuildChannelData({
      type: D.ChannelType.GuildText,
      parent_id: category.id,
      name: `Match Logs`,
      topic: `Ranked matches in this server are recorded here`,
      permission_overwrites: matchLogsChannelPermissionOverwrites(app, guild.data.id),
    }),
  }
}

function matchLogsChannelPermissionOverwrites(
  app: App,
  guild_id: string,
): D.RESTAPIChannelPatchOverwrite[] {
  return [
    {
      // @everyone can't send messages or make threads
      id: guild_id,
      type: 0, // role
      deny: (
        D.PermissionFlagsBits.SendMessages |
        D.PermissionFlagsBits.SendMessagesInThreads |
        D.PermissionFlagsBits.CreatePublicThreads |
        D.PermissionFlagsBits.CreatePrivateThreads
      ).toString(),
    },
    {
      // the bot can send messages and make public threads
      id: app.bot.application_id,
      type: 1, // user
      allow: (
        D.PermissionFlagsBits.SendMessages |
        D.PermissionFlagsBits.SendMessagesInThreads |
        D.PermissionFlagsBits.CreatePublicThreads |
        D.PermissionFlagsBits.CreatePrivateThreads
      ).toString(),
    },
  ]
}
