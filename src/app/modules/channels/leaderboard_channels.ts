import { APIChannelPatchOverwrite, APIEmbed, ChannelType, PermissionFlagsBits } from 'discord-api-types/v10';

import { Guild, GuildLeaderboard, Leaderboard } from '../../../database/models';
import { DiscordRESTClient, GuildChannelData, MessageData } from '../../../discord';

import { App } from '../../app';
import queue from '../../interactions/views/queue';
import { Colors } from '../../utils/messages/message_pieces';

import { syncRankedCategory } from '../guilds';
import { getLeaderboardCurrentDivision } from '../leaderboards';



export async function syncLeaderboardChannelsMessages(
  app: App,
  guild_leaderboard: GuildLeaderboard
): Promise<void> {
  await syncLbDisplayChannel(app, guild_leaderboard)
  await syncLbDisplayMessage(app, guild_leaderboard)

  if (app.config.features.QUEUE_MESSAGE) {
    await haveLeaderboardQueueMessage(app, guild_leaderboard)
  }
}export async function getLbChanneldata(
  app: App,
  guild: Guild,
  leaderboard: Leaderboard
): Promise<{
  guild_id: string
  data: GuildChannelData
}> {
  let category = (await syncRankedCategory(app, guild)).channel
  return {
    guild_id: guild.data.id,
    data: new GuildChannelData({
      type: ChannelType.GuildText,
      parent_id: category.id,
      name: `${leaderboard.data.name} Leaderboard`,
      topic: 'This leaderboard is displayed and updated live here',
      permission_overwrites: leaderboardChannelPermissionOverwrites(
        guild.data.id,
        app.bot.application_id
      ),
    }),
  }
}
export async function syncLbDisplayChannel(app: App, guild_leaderboard: GuildLeaderboard): Promise<void> {
  const guild = await guild_leaderboard.guild()
  const leaderboard = await guild_leaderboard.leaderboard()

  const result = await app.bot.utils.syncGuildChannel({
    target_channel_id: guild_leaderboard.data.display_channel_id,
    channelData: async () => {
      return await getLbChanneldata(app, guild, leaderboard)
    },
  })

  if (result.is_new_channel) {
    await guild_leaderboard.update({
      display_channel_id: result.channel.id,
    })
  }
}

export async function syncLbDisplayMessage(
  app: App,
  guild_leaderboard: GuildLeaderboard
): Promise<void> {
  // update all the messages and channels associated with this guild leaderboard
  const leaderboard = await guild_leaderboard.leaderboard()
  const division = await getLeaderboardCurrentDivision(app.db, leaderboard)
  const players = await division.getOrderedTopPlayers()
  const guild = await guild_leaderboard.guild()

  const displayed_players: Map<string, number> = new Map()

  players.forEach((p) => {
    if (p.data.rating) {
      displayed_players.set(p.data.user_id, p.data.rating)
    }
  })

  // a channel for the leaderboard and queue
  const update_display_message_result = await app.bot.utils.syncChannelMessage({
    target_channel_id: guild_leaderboard.data.display_channel_id,
    target_message_id: guild_leaderboard.data.display_message_id,
    message: async () => {
      return generateLeaderboardMessage({
        ordered_top_players: displayed_players,
        lb_name: leaderboard.data.name,
      })
    },
    channelData: async () => {
      return await getLbChanneldata(app, guild, leaderboard)
    },
  })

  if (update_display_message_result.new_channel) {
    await guild_leaderboard.update({
      display_channel_id: update_display_message_result.new_channel.id,
    })
  }
  if (update_display_message_result.is_new_message) {
    await guild_leaderboard.update({
      display_message_id: update_display_message_result.message.id,
    })
  }
}
export function generateLeaderboardMessage(data: {
  ordered_top_players: Map<string, number>
  lb_name: string
}): MessageData {
  let place = 0
  const players_text = [...data.ordered_top_players.entries()]
    .map(([player_id, points]) => {
      place++
      return `${place <= 3 ? `### ` : ``}${place}. <@${player_id}> (${points})`
    })
    .join('\n')

  let embed: APIEmbed = {
    description: `${players_text}` || 'No players yet',
    color: Colors.Primary,
  }

  return new MessageData({
    content: `# ${data.lb_name}`,
    embeds: [embed],
    components: [],
    allowed_mentions: {
      parse: [],
    },
  })
}
export function leaderboardChannelPermissionOverwrites(
  guild_id: string,
  application_id: string
): APIChannelPatchOverwrite[] {
  return [
    {
      // @everyone can't send messages or make threads
      id: guild_id,
      type: 0,
      deny: (
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.SendMessagesInThreads |
        PermissionFlagsBits.CreatePublicThreads |
        PermissionFlagsBits.CreatePrivateThreads
      ).toString(),
    },
    {
      // the bot can send messages and make public threads
      id: application_id,
      type: 1,
      allow: (
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.SendMessagesInThreads |
        PermissionFlagsBits.CreatePublicThreads
      ).toString(),
    },
  ]
}
export async function haveLeaderboardQueueMessage(
  app: App,
  guild_leaderboard: GuildLeaderboard
): Promise<void> {
  const result = await app.bot.utils.syncChannelMessage({
    target_channel_id: guild_leaderboard.data.display_channel_id,
    target_message_id: guild_leaderboard.data.queue_message_id,
    message: async () => {
      let division_id = (
        await getLeaderboardCurrentDivision(app.db, await guild_leaderboard.leaderboard())
      ).data.id
      return await queue(app).send({ division_id })
    },
    channelData: async () => {
      throw new Error('No channel to post queue message in. Need to make leaderboard message first')
    },
  })

  if (result.is_new_message) {
    await guild_leaderboard.update({
      queue_message_id: result.message.id,
    })
  }
}
export async function removeLeaderboardChannelsMessages(
  bot: DiscordRESTClient,
  leaderboard: Leaderboard
): Promise<void> {
  const guild_leaderboards = await leaderboard.guildLeaderboards()
  await Promise.all(
    guild_leaderboards.map(async (guild_leaderboard) => {
      await bot.utils.deleteChannelIfExists({
        target_channel_id: guild_leaderboard.data.display_channel_id,
      })
    })
  )
}

