import * as D from 'discord-api-types/v10'
import type { Guild } from '../../../../../database/models'
import { GuildChannelData, MessageData } from '../../../../../discord-framework'
import { sentry } from '../../../../../logging/sentry'
import { App } from '../../../../app/App'
import { Colors } from '../../../ui-helpers/constants'
import { commandMention } from '../../../ui-helpers/strings'
import { syncRankedCategory } from '../../guilds/guilds'
import matches from './views/commands/matches'


export async function syncMatchesChannel(app: App, guild: Guild): Promise<D.APIChannel> {
  sentry.debug(`syncMatchesChannel`, { guild_id: guild.data.id })
  const sync_channel_result = await app.discord.utils.syncGuildChannel({
    target_channel_id: guild.data.matches_channel_id,
    channelData: () => matchLogsChannelData(app, guild),
  })

  if (sync_channel_result.is_new_channel) {
    await Promise.all([
      app.discord.createMessage(
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
  const matches_cmd_mention = await commandMention(app, matches, guild.data.id)

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
  const category = (await syncRankedCategory(app, guild)).channel
  return {
    guild_id: guild.data.id,
    data: new GuildChannelData({
      type: D.ChannelType.GuildText,
      parent_id: category.id,
      name: `games`,
      topic: `Ranked matches in this server are recorded here`,
      permission_overwrites: matchLogsChannelPermissionOverwrites(app, guild.data.id),
      default_auto_archive_duration: D.ThreadAutoArchiveDuration.OneHour,
    }),
  }
}

function matchLogsChannelPermissionOverwrites(
  app: App,
  guild_id: string,
): D.RESTAPIChannelPatchOverwrite[] {
  return [
    {
      id: guild_id, //@everyone
      type: 0, // role
      deny: (
        D.PermissionFlagsBits.SendMessages |
        D.PermissionFlagsBits.CreatePublicThreads |
        D.PermissionFlagsBits.CreatePrivateThreads
      ).toString(),
    },
    {
      id: app.discord.application_id, // bot
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
