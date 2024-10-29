import * as D from 'discord-api-types/v10'
import type { Guild, GuildRanking, Ranking } from '../../../../database/models'
import { GuildChannelData, MessageData } from '../../../../discord-framework'
import { sentry } from '../../../../logging/sentry'
import { type App } from '../../../app/App'
import { Colors } from '../../helpers/constants'
import { escapeMd, relativeTimestamp, space } from '../../helpers/strings'
import { syncRankedCategory } from '../guilds/guilds'
import { getLeaderboardPlayers } from '../players/display_stats'

export async function syncRankingLbMessages(app: App, ranking: Ranking): Promise<void> {
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
  enable_if_disabled = false,
) {
  if (!guild_ranking.data.display_settings?.leaderboard_message && !enable_if_disabled) return

  const guild = await guild_ranking.guild
  const ranking = await guild_ranking.ranking

  const result = await app.discord.utils.syncChannelMessage({
    target_channel_id: guild_ranking.data.leaderboard_channel_id,
    target_message_id: guild_ranking.data.leaderboard_message_id,
    messageData: await leaderboardMessage(ranking),
    channelData: () => lbChannelData(app, guild, ranking),
  })

  if (result.is_new_message || result.new_channel) {
    await guild_ranking.update({
      leaderboard_channel_id: result.new_channel?.id ?? guild_ranking.data.leaderboard_channel_id,
      leaderboard_message_id: result.is_new_message ? result.message.id : undefined,
      display_settings: { ...guild_ranking.data.display_settings, leaderboard_message: true },
    })
    sentry.debug(`synced leaderboard message. ${guild_ranking.data.leaderboard_message_id}`)
  }
  return result
}

export async function disableGuildRankingLbMessage(app: App, guild_ranking: GuildRanking) {
  await app.discord.deleteMessageIfExists(
    guild_ranking.data.leaderboard_channel_id,
    guild_ranking.data.leaderboard_message_id,
  )
  await guild_ranking.update({
    display_settings: {
      ...guild_ranking.data.display_settings,
      leaderboard_message: false,
    },
  })
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
  const category = (await syncRankedCategory(app, guild)).channel
  return {
    guild_id: guild.data.id,
    data: new GuildChannelData({
      type: D.ChannelType.GuildText,
      parent_id: category.id,
      name: `${escapeMd(ranking.data.name)} Leaderboard`,
      topic: 'This leaderboard is displayed and updated live here',
      permission_overwrites: leaderboardChannelPermissionOverwrites(
        guild.data.id,
        app.discord.application_id,
      ),
    }),
    reason: `Leaderboard channel for ${ranking.data.name}`,
  }
}

export async function leaderboardMessage(ranking: Ranking): Promise<MessageData> {
  const players = await getLeaderboardPlayers(ranking)

  let place = 0
  const max_rating_len = players[0]?.display_rating.toFixed(0).length ?? 0

  const players_text = players
    .map(p => {
      const display_rating = p.display_rating.toFixed(0).padStart(max_rating_len)
      if (p.provisional) {
        return `-# ${space}?`
       + `${space}\`${display_rating}\``
       + `${space}<@${p.user_id}> ` // prettier-ignore
      }
      place++
      return `### ${(place => {
        if (place==1) return `🥇`
        else if (place==2) return `🥈`
        else if (place==3) return `🥉`
        else return `${place}.${space}`
      })(place)}` 
      + `${space}\`${display_rating}\``
      + `${space}<@${p.user_id}> ` // prettier-ignore
    })
    .join('\n\n')

  const embed: D.APIEmbed = {
    title: `${escapeMd(ranking.data.name)} Leaderboard`,
    description: 
      (players_text || 'No players yet') 
      + `\n\n-# Last updated ${relativeTimestamp(new Date())}`, //prettier-ignore
    color: Colors.Primary,
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
