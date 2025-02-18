import * as D from 'discord-api-types/v10'
import type { Guild, GuildRanking, Ranking } from '../../../database/models'
import { PartialGuildRanking } from '../../../database/models/guildrankings'
import { PartialRanking } from '../../../database/models/rankings'
import { MessageData } from '../../../discord-framework'
import { sentry } from '../../../logging/sentry'
import { nonNullable } from '../../../utils/utils'
import { type App } from '../../context/app'
import { Colors } from '../../ui-helpers/constants'
import { commandMention, escapeMd, relativeTimestamp, space } from '../../ui-helpers/strings'
import { syncRankedCategory } from '../guilds/guilds'
import { getOrderedLeaderboardPlayers } from '../players/display'
import leaderboardCmd from './views/leaderboard-cmd'

export async function syncRankingLbMessages(app: App, ranking: PartialRanking): Promise<void> {
  sentry.debug(`syncRankingLbMessages ranking: ${ranking.data.id}`)
  const guild_rankings = await app.db.guild_rankings.fetch({ ranking_id: ranking.data.id })
  await Promise.all(
    guild_rankings.map(async guild_ranking => {
      await syncGuildRankingLbMessage(app, guild_ranking.guild_ranking)
    }),
  )
}

export async function syncGuildRankingLbMessage(
  app: App,
  p_guild_ranking: PartialGuildRanking,
  {
    // if true, will update the guild ranking's config to enable the lb message
    enable_if_disabled = false,
    // if true, will not edit the message if it already exists
    no_edit = false,
  } = {},
): Promise<{ message: D.APIMessage; channel_id: string } | undefined> {
  sentry.debug(`syncGuildRankingLbMessage ${p_guild_ranking}`)

  const { guild, ranking, guild_ranking } = await p_guild_ranking.fetch()

  if (!guild_ranking.data.display_settings?.leaderboard_message && !enable_if_disabled) return

  const message_data = new MessageData({
    embeds: (
      await leaderboardMessage(app, ranking, {
        guild_id: guild.data.id,
      })
    ).embeds,
  })

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
      result.new_channel?.id ??
      nonNullable(guild_ranking.data.leaderboard_channel_id, 'existing lb channel id'),
  }
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

export async function sendLbChannel(
  app: App,
  guild: Guild,
  ranking: Ranking,
): Promise<D.APIChannel> {
  const category = (await syncRankedCategory(app, guild)).channel
  return await app.discord.createGuildChannel(guild.data.id, {
    type: D.ChannelType.GuildText,
    parent_id: category.id,
    name: `${escapeMd(ranking.data.name)} Leaderboard`,
    topic: 'This leaderboard is displayed and updated live here',
    permission_overwrites: leaderboardChannelPermissionOverwrites(
      guild.data.id,
      app.discord.application_id,
    ),
  })
}

export async function leaderboardMessage(
  app: App,
  ranking: Ranking,
  options?: {
    guild_id?: string
    full?: boolean
    page?: number
  },
): Promise<{ embeds: D.APIEmbed[]; max_page: number }> {
  const players = await getOrderedLeaderboardPlayers(app, ranking)

  let place = 0
  const max_rating_len = players[0]?.rating.toFixed(0).length ?? 0

  const players_lines = players
    .map(p => {
      const rating_text = `\`${p.rating.toFixed(0)}\``.padStart(
        max_rating_len + 2 - `${place}`.length,
      )
      if (p.is_provisional) {
        return null
      } else {
        place++
        return (
          `### ${(place => {
            if (place == 1) return `🥇`
            else if (place == 2) return `🥈`
            else if (place == 3) return `🥉`
            else return `${place}.${space}`
          })(place)}` +
          `${space}${rating_text}` +
          `${space}<@${p.user_id}> `
        )
      }
    })
    .filter(Boolean) as string[]

  const provisional_players_lines = options?.full
    ? (players
        .map(p => {
          // const rating_text = `\`${p.rating.toFixed(0)}?\``
          if (p.is_provisional) {
            return `### -# ?.${space + space}\`???\`${space}<@${p.user_id}>`
          } else {
            return null
          }
        })
        .filter(Boolean) as string[])
    : undefined

  const lines_per_page = 25
  const page = options?.page ?? 1

  let all_lines = players_lines
  if (options?.full) {
    all_lines = all_lines.concat(provisional_players_lines ?? [])
  }

  const current_page_lines = all_lines.slice((page - 1) * lines_per_page, page * lines_per_page)

  if (current_page_lines.length == 0) {
    current_page_lines.push(`No players to show.`)
  }

  const bottom_text =
    `-# Last updated ${relativeTimestamp(new Date(Date.now()))}. ` +
    `\n-# Unranked players are given a provisional rating and` +
    ` are hidden from the main leaderboard until they play more games.` +
    (options?.full
      ? ``
      : `\nUse ${await commandMention(app, leaderboardCmd, options?.guild_id)} \`${escapeMd(ranking.data.name)}\` to see the full leaderboard.`)

  const embed: D.APIEmbed = {
    title: `${escapeMd(ranking.data.name)} Leaderboard`,
    description: current_page_lines.join('\n') + '\n' + bottom_text,
    color: Colors.Primary,
  }

  const embeds = [embed]

  const max_page = Math.ceil(all_lines.length / lines_per_page)

  return {
    embeds,
    max_page,
  }
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
