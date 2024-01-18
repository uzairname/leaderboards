import * as D from 'discord-api-types/v10'
import type { Guild, GuildRanking, Ranking } from '../../../database/models'
import { GuildChannelData, MessageData } from '../../../discord-framework'
import { sentry } from '../../../request/sentry'
import { type App } from '../../app/app'
import { Colors, escapeMd, relativeTimestamp, space } from '../../messages/message_pieces'
import { syncRankedCategory } from '../guilds'

export function addRankingChannelsListeners(app: App) {
  app.events.RankingLeaderboardUpdated.on(async ranking => {
    await syncRankingLbMessages(app, ranking)
  })
  app.events.MatchScored.on(async match => {
    await app.events.RankingLeaderboardUpdated.emit(await match.ranking())
  })
}

export async function syncRankingLbMessages(app: App, ranking: Ranking): Promise<void> {
  sentry.debug('syncLeaderboardMessages')
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: ranking.data.id })
  await Promise.all(
    guild_rankings.map(async guild_ranking => {
      await syncGuildRankingLbMessage(app, guild_ranking.guild_ranking)
    }),
  )
}

export async function syncGuildRankingLbMessage(
  app: App,
  guild_ranking: GuildRanking,
  create_channel_if_not_exists: boolean = false,
): Promise<void> {
  // check if the leaderboard message is enabled for the guild ranking
  sentry.debug(`leaderboard_message: ${guild_ranking.data.display_settings?.leaderboard_message}`)
  if (!guild_ranking.data.display_settings?.leaderboard_message) return

  const guild = await guild_ranking.guild
  const ranking = await guild_ranking.ranking

  sentry.debug('syncing leaderboard message')
  const result = await app.bot.utils.syncChannelMessage({
    target_channel_id: guild_ranking.data.leaderboard_channel_id,
    target_message_id: guild_ranking.data.leaderboard_message_id,
    messageData: () => leaderboardMessage(ranking),
    channelData: create_channel_if_not_exists
      ? () => lbChannelData(app, guild, ranking)
      : undefined,
  })
  sentry.debug('edited leaderboard message')

  if (result.is_new_message || result.new_channel) {
    await guild_ranking.update({
      leaderboard_channel_id: result.new_channel?.id ?? guild_ranking.data.leaderboard_channel_id,
      leaderboard_message_id: result.is_new_message ? result.message.id : undefined,
    })
  }
}

export async function lbChannelData(
  app: App,
  guild: Guild,
  ranking: Ranking,
): Promise<{
  guild_id: string
  data: GuildChannelData
  reason?: string
}> {
  let category = (await syncRankedCategory(app, guild)).channel
  return {
    guild_id: guild.data.id,
    data: new GuildChannelData({
      type: D.ChannelType.GuildText,
      parent_id: category.id,
      name: `${escapeMd(ranking.data.name)} Leaderboard`,
      topic: 'This leaderboard is displayed and updated live here',
      permission_overwrites: leaderboardChannelPermissionOverwrites(
        guild.data.id,
        app.bot.application_id,
      ),
    }),
    reason: `Leaderboard channel for ${ranking.data.name}`,
  }
}

export async function leaderboardMessage(ranking: Ranking): Promise<MessageData> {
  const players = await ranking.getOrderedTopPlayers()

  let place = 0
  const max_rating_len = players[0].data.rating?.toFixed(0).length ?? 0
  const players_text = players
    .filter(p => p.data.rating != null && p.data.rating != undefined)
    .map(p => {
      place++
      return `### ${(place => {
        if (place==1) return `🥇`
        else if (place==2) return `🥈`
        else if (place==3) return `🥉`
        else return `${place}.${space}`
      })(place)}` 
      + `${space}\`${p.data.rating!.toFixed(0).padStart(max_rating_len)}\``
      + `${space}<@${p.data.user_id}> ` // prettier-ignore
    })
    .join('\n\n')

  let embed: D.APIEmbed = {
    title: `${escapeMd(ranking.data.name)} Leaderboard`,
    description: 
      (players_text || 'No players yet') 
      + `\n\nLast updated ${relativeTimestamp(new Date())}`, //prettier-ignore
    color: Colors.EmbedBackground,
  }

  return new MessageData({
    content: null,
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
): D.APIChannelPatchOverwrite[] {
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

export async function removeRankingMessages(app: App, ranking: Ranking): Promise<void> {
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: ranking.data.id })
  await Promise.all(
    guild_rankings.map(async item => {
      await app.bot.utils.deleteMessageIfExists(
        item.guild_ranking.data.leaderboard_channel_id,
        item.guild_ranking.data.leaderboard_message_id,
      )
    }),
  )
}
