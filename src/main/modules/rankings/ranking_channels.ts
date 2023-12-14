import {
  APIChannelPatchOverwrite,
  APIEmbed,
  ChannelType,
  PermissionFlagsBits,
} from 'discord-api-types/v10'

import type { Guild, GuildRanking, Ranking } from '../../../database/models'
import { type DiscordRESTClient, GuildChannelData, MessageData } from '../../../discord-framework'

import { type App } from '../../app/app'
import { Colors } from '../../messages/message_pieces'

import { syncRankedCategory } from '../guilds'
import { sentry } from '../../../request/sentry'
import { haveRankingQueueMessage } from '../matches/queue_messages'

export function addRankingChannelsListeners(app: App) {
  app.events.RankingUpdated.on(async (ranking) => {
    const guild_rankings = await app.db.guild_rankings.get({ ranking_id: ranking.data.id })
    await Promise.all(
      guild_rankings.map(async (item) => {
        await syncGuildRankingChannelsMessages(app, item.guild_ranking)
      }),
    )
  })

  app.events.MatchScored.on(async (match) => {
    const guild_rankings = await app.db.guild_rankings.get({ ranking_id: match.data.ranking_id })
    await Promise.all(
      guild_rankings.map(async (guild_ranking) => {
        await syncGuildRankingLbMessage(app, guild_ranking.guild_ranking)
      }),
    )
  })

  app.events.GuildRankingCreated.on(async (guild_ranking) => {
    await syncGuildRankingChannelsMessages(app, guild_ranking)
  })

  app.events.GuildRankingUpdated.on(async (guild_ranking) => {
    await syncGuildRankingChannelsMessages(app, guild_ranking)
  })
}

export async function syncGuildRankingChannelsMessages(
  app: App,
  guild_ranking: GuildRanking,
): Promise<void> {
  sentry.debug('syncing ranking channels messages')
  await syncGuildRankingLbChannel(app, guild_ranking)
  await syncGuildRankingLbMessage(app, guild_ranking)

  if (app.config.features.QUEUE_MESSAGE) {
    await haveRankingQueueMessage(app, guild_ranking)
  }
}

export async function lbChannelData(
  app: App,
  guild: Guild,
  ranking: Ranking,
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
      name: `${ranking.data.name} Leaderboard`,
      topic: 'This leaderboard is displayed and updated live here',
      permission_overwrites: leaderboardChannelPermissionOverwrites(
        guild.data.id,
        app.bot.application_id,
      ),
    }),
  }
}

export async function syncGuildRankingLbChannel(
  app: App,
  guild_ranking: GuildRanking,
): Promise<void> {
  const guild = await guild_ranking.guild()
  const ranking = await guild_ranking.ranking()

  const result = await app.bot.utils.syncGuildChannel({
    target_channel_id: guild_ranking.data.leaderboard_channel_id,
    channelData: async () => {
      return await lbChannelData(app, guild, ranking)
    },
  })

  if (result.is_new_channel) {
    await guild_ranking.update({
      leaderboard_channel_id: result.channel.id,
    })
  }
}

export async function syncGuildRankingLbMessage(
  app: App,
  guild_ranking: GuildRanking,
): Promise<void> {
  // update all the messages and channels associated with this guild leaderboard
  const ranking = await guild_ranking.ranking()
  const guild = await guild_ranking.guild()

  // a channel for the leaderboard and queue
  const update_display_message_result = await app.bot.utils.syncChannelMessage({
    target_channel_id: guild_ranking.data.leaderboard_channel_id,
    target_message_id: guild_ranking.data.leaderboard_message_id,
    messageData: async () => {
      return generateLeaderboardMessage(app, ranking)
    },
    channelData: async () => {
      return await lbChannelData(app, guild, ranking)
    },
  })

  if (update_display_message_result.new_channel) {
    await guild_ranking.update({
      leaderboard_channel_id: update_display_message_result.new_channel.id,
    })
  }
  if (update_display_message_result.is_new_message) {
    await guild_ranking.update({
      leaderboard_message_id: update_display_message_result.message.id,
    })
  }
}

export async function generateLeaderboardMessage(app: App, ranking: Ranking): Promise<MessageData> {
  const players = await ranking.getOrderedTopPlayers()
  const lb_name = ranking.data.name

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
      return `### ${place}. <@${player_id}> ${(points * 10).toFixed(0)}`
    })
    .join('\n\n')

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
        PermissionFlagsBits.CreatePublicThreads |
        PermissionFlagsBits.CreatePrivateThreads
      ).toString(),
    },
  ]
}

export async function removeRankingLbChannels(app: App, ranking: Ranking): Promise<void> {
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: ranking.data.id })
  await Promise.all(
    guild_rankings.map(async (item) => {
      await app.bot.utils.deleteChannelIfExists(item.guild_ranking.data.leaderboard_channel_id)
    }),
  )
}
