import {
  APIChannelPatchOverwrite,
  APIEmbed,
  ChannelType,
  PermissionFlagsBits,
} from 'discord-api-types/v10'

import { Guild, GuildRanking, Ranking, RankingDivision } from '../../../database/models'
import { DiscordRESTClient, GuildChannelData, MessageData } from '../../../discord'

import { App } from '../../app'
import queue from '../../interactions/message_views/queue'
import { Colors } from '../../messages/message_pieces'

import { syncRankedCategory } from '../guilds'
import { getRankingById, getRankingCurrentDivision } from '../rankings'

export async function syncLeaderboardChannelsMessages(
  app: App,
  guild_leaderboard: GuildRanking,
): Promise<void> {
  await syncLbDisplayChannel(app, guild_leaderboard)
  await syncLbDisplayMessage(app, guild_leaderboard)

  if (app.config.features.QUEUE_MESSAGE) {
    await haveRankingQueueMessage(app, guild_leaderboard)
  }
}

export async function lbChanneldata(
  app: App,
  guild: Guild,
  leaderboard: Ranking,
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
        app.bot.application_id,
      ),
    }),
  }
}

export async function syncLbDisplayChannel(
  app: App,
  guild_leaderboard: GuildRanking,
): Promise<void> {
  const guild = await guild_leaderboard.guild()
  const leaderboard = await guild_leaderboard.ranking()

  const result = await app.bot.utils.syncGuildChannel({
    target_channel_id: guild_leaderboard.data.leaderboard_channel_id,
    channelData: async () => {
      return await lbChanneldata(app, guild, leaderboard)
    },
  })

  if (result.is_new_channel) {
    await guild_leaderboard.update({
      leaderboard_channel_id: result.channel.id,
    })
  }
}

export async function syncLbDisplayMessage(
  app: App,
  guild_leaderboard: GuildRanking,
): Promise<void> {
  // update all the messages and channels associated with this guild leaderboard
  const leaderboard = await guild_leaderboard.ranking()
  const division = await getRankingCurrentDivision(app.db, leaderboard)
  const guild = await guild_leaderboard.guild()

  // a channel for the leaderboard and queue
  const update_display_message_result = await app.bot.utils.syncChannelMessage({
    target_channel_id: guild_leaderboard.data.leaderboard_channel_id,
    target_message_id: guild_leaderboard.data.leaderboard_message_id,
    message: async () => {
      return generateLeaderboardMessage(app, division)
    },
    channelData: async () => {
      return await lbChanneldata(app, guild, leaderboard)
    },
  })

  if (update_display_message_result.new_channel) {
    await guild_leaderboard.update({
      leaderboard_channel_id: update_display_message_result.new_channel.id,
    })
  }
  if (update_display_message_result.is_new_message) {
    await guild_leaderboard.update({
      leaderboard_message_id: update_display_message_result.message.id,
    })
  }
}

export async function generateLeaderboardMessage(
  app: App,
  leaderboard_division: RankingDivision,
): Promise<MessageData> {
  const players = await leaderboard_division.getOrderedTopPlayers()
  const lb_name = (await getRankingById(app.db, leaderboard_division.data.ranking_id)).data.name

  const displayed_players: Map<string, number> = new Map()

  players.forEach((p) => {
    if (p.data.rating) {
      displayed_players.set(p.data.user_id, p.data.rating)
    }
  })

  let place = 0
  const players_text = [...displayed_players.entries()]
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
    content: `# ${lb_name}`,
    embeds: [embed],
    components: null,
    allowed_mentions: {
      parse: [],
    },
  })
}

export function leaderboardChannelPermissionOverwrites(
  guild_id: string,
  application_id: string,
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

export async function haveRankingQueueMessage(
  app: App,
  guild_ranking: GuildRanking,
): Promise<void> {
  const result = await app.bot.utils.syncChannelMessage({
    target_channel_id: guild_ranking.data.leaderboard_channel_id,
    target_message_id: guild_ranking.data.queue_message_id,
    message: async () => {
      let division_id = (await getRankingCurrentDivision(app.db, await guild_ranking.ranking()))
        .data.id
      return await queue(app).init(division_id)
    },
    channelData: async () => {
      throw new Error('No channel to post queue message in. Need to make leaderboard message first')
    },
  })

  if (result.is_new_message) {
    await guild_ranking.update({
      queue_message_id: result.message.id,
    })
  }
}

export async function removeRankingChannelsMessages(
  bot: DiscordRESTClient,
  ranking: Ranking,
): Promise<void> {
  const guild_rankings = await ranking.guildLeaderboards()
  await Promise.all(
    guild_rankings.map(async (guild_ranking) => {
      await bot.utils.deleteChannelIfExists(guild_ranking.data.leaderboard_channel_id)
    }),
  )
}
