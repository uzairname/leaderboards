import * as D from 'discord-api-types/v10'
import { eq, and } from 'drizzle-orm'
import type { Guild, GuildRanking, Match, Player } from '../../../../database/models'
import { MatchSummaryMessages } from '../../../../database/schema'
import type { MatchPlayerSelect } from '../../../../database/types'
import { GuildChannelData, MessageData } from '../../../../discord-framework'
import { sentry } from '../../../../request/logging'
import { maxIndex, nonNullable } from '../../../../utils/utils'
import { App } from '../../../app-context/app-context'
import {
  Colors,
  commandMention,
  emojis,
  escapeMd,
  relativeTimestamp,
} from '../../../messages/message_pieces'
import { getOrUpdateRankedCategory } from '../../guilds'
import { default_elo_settings } from '../../rankings/manage_rankings'
import { calculateMatchNewRatings } from '../scoring/score_matches'
import { matchesCommandDef, matches_command_def } from './matches_command'

export function addMatchSummaryMessageListeners(app: App): void {
  app.events.MatchCreatedOrUpdated.on(async match => {
    await syncMatchSummaryMessages(app, match)
  })
}

/**
 * Sync match logs messages for this match across all guilds the match's ranking is in
 */
async function syncMatchSummaryMessages(app: App, match: Match): Promise<void> {
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: match.data.ranking_id })

  await Promise.all(
    guild_rankings.map(async item => {
      if (item.guild_ranking.data.display_settings?.log_matches) {
        await syncMatchSummaryMessageInGuild(app, match, item.guild_ranking)
      }
    }),
  )
}

/**
 * Updates the match's log message, according to the guild ranking's settings
 */
async function syncMatchSummaryMessageInGuild(
  app: App,
  match: Match,
  guild_ranking: GuildRanking,
): Promise<void> {
  if (!guild_ranking.data.display_settings?.log_matches) return

  const guild = await guild_ranking.guild

  const sync_channel_result = await app.bot.utils.syncGuildChannel({
    target_channel_id: guild.data.match_results_channel_id,
    channelData: async () => matchLogsChannelData(app, guild),
  })

  if (sync_channel_result.is_new_channel) {
    await Promise.all([
      app.bot.createMessage(
        sync_channel_result.channel.id,
        (await matchLogsChannelDescriptionMessageData(app, guild)).postdata,
      ),
      guild.update({
        match_results_channel_id: sync_channel_result.channel.id,
      }),
    ])
  }

  const existing_message = await match.summaryMessage(guild_ranking.data.guild_id)
  sentry.debug(`existing message: ${existing_message}`)

  const sync_message_result = await app.bot.utils.syncChannelMessage({
    target_channel_id: sync_channel_result.channel.id,
    target_message_id: existing_message?.message_id,
    messageData: await matchSummaryMessageData(app, match),
  })

  if (sync_message_result.is_new_message) {
    if (existing_message) {
      await app.db.db
        .update(MatchSummaryMessages)
        .set({
          message_id: sync_message_result.message.id,
        })
        .where(
          and(
            eq(MatchSummaryMessages.match_id, match.data.id),
            eq(MatchSummaryMessages.guild_id, guild_ranking.data.guild_id),
          ),
        )
    } else {
      await app.db.db.insert(MatchSummaryMessages).values({
        match_id: match.data.id,
        guild_id: guild_ranking.data.guild_id,
        message_id: sync_message_result.message.id,
      })
    }
  }
}

export async function matchSummaryMessageData(app: App, match: Match): Promise<MessageData> {
  return new MessageData({
    embeds: [
      await matchSummaryEmbed(app, match, await match.teams(), {
        ranking_name: true,
        id: true,
        time_finished: true,
      }),
    ],
  })
}

export async function matchSummaryEmbed(
  app: App,
  match: Match,
  team_players: { player: Player; match_player: MatchPlayerSelect }[][],
  options?: {
    ranking_name?: boolean
    id?: boolean
    time_finished?: boolean
    include_outcome_num?: boolean
  },
): Promise<D.APIEmbed> {
  sentry.debug(
    'team players,',
    JSON.stringify(
      team_players.map(t =>
        t.map(p => {
          return {
            id: nonNullable(p.player.data.id, 'player id'),
            rating: nonNullable(p.match_player.rating_before, 'rating before'),
            rd: nonNullable(p.match_player.rd_before, 'rd before'),
          }
        }),
      ),
    ),
    match.data.id,
  )

  const new_ratings = calculateMatchNewRatings(
    match,
    team_players.map(t =>
      t.map(p => {
        return {
          id: nonNullable(p.player.data.id, 'player id'),
          rating_before: nonNullable(p.match_player.rating_before, 'rating before'),
          rd_before: nonNullable(p.match_player.rd_before, 'rd before'),
        }
      }),
    ),
    (await match.ranking()).data.elo_settings ?? default_elo_settings,
  )

  let details: string = options?.id ? `id: \`${match.data.id}\`` : ''

  const time_finished_str =
    options?.time_finished && match.data.time_finished
      ? `${relativeTimestamp(match.data.time_finished)}`
      : ``

  const winning_team_index = maxIndex(match.data.outcome ?? [])
  const is_draw = winning_team_index === -1

  const embed = {
    title: (options?.ranking_name ? `${escapeMd((await match.ranking()).data.name)} ` : '') 
      + `Match ${match.data.number}`
      // If details only contains the time finished, put it in the title 
      // of the embed instead of a separate field.
      + (time_finished_str 
        ? (details
          ? (() => {
              if (time_finished_str) details = `Finished ${time_finished_str}\n` + details; return ``
            })()
          : ` - ${time_finished_str}`) 
        : ``)
      ,
    fields: [team_players.map((team, team_num) => {
      const team_outcome = `${nonNullable(match.data.outcome, 'match outcome')[team_num]}`
      return {
        name:
          (is_draw 
            ? emojis.light_circle + (options?.include_outcome_num ? team_outcome : `Draw`)
            : (team_num === winning_team_index 
              ? emojis.green_triangle + (options?.include_outcome_num ? team_outcome : `Win`)
              : emojis.red_triangle + (options?.include_outcome_num ? team_outcome : `Loss`)
            )
          ),
        value: team
          .map((player, player_num) => {
            const rating_after_text =
              new_ratings[team_num][player_num].rating_after.toFixed(0)
            const diff =
              new_ratings[team_num][player_num].rating_after -
              nonNullable(player.match_player.rating_before)
            const diff_text = (parseInt(diff.toFixed(0)) > 0 ? '+' : '') + diff.toFixed(0)
            return `<@${player.player.data.user_id}> ${rating_after_text} *(${diff_text})*`
          })
          .join('\n'),
        inline: true
      }
    }), details ? [{
      name: `Details`,
      value: details,
    }] : []].flat(),
    color: Colors.EmbedBackground,
  } // prettier-ignore

  return embed
}

async function matchLogsChannelDescriptionMessageData(
  app: App,
  guild: Guild,
): Promise<MessageData> {
  const matches_cmd_mention = await commandMention(app, matches_command_def, guild.data.id)

  const msg = new MessageData({
    embeds: [
      {
        title: `Match Logs`,
        description:
          `Ranked matches in this server are recorded in this channel.` +
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
  let category = (await getOrUpdateRankedCategory(app, guild)).channel
  return {
    guild_id: guild.data.id,
    data: new GuildChannelData({
      type: D.ChannelType.GuildText,
      parent_id: category.id,
      name: `Match Log`,
      topic: `Ranked matches in this server are recorded here`,
      permission_overwrites: matchLogsChannelPermissionOverwrites(app, guild.data.id),
    }),
  }
}

function matchLogsChannelPermissionOverwrites(
  app: App,
  guild_id: string,
): D.APIChannelPatchOverwrite[] {
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
