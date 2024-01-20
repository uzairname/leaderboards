import * as D from 'discord-api-types/v10'
import { type InferInsertModel, eq, and } from 'drizzle-orm'
import { Guild, GuildRanking, Match, Player, Ranking } from '../../../../database/models'
import { MatchSummaryMessages } from '../../../../database/schema'
import { MatchPlayerSelect } from '../../../../database/types'
import { GuildChannelData, MessageData } from '../../../../discord-framework'
import { sentry } from '../../../../request/sentry'
import { maxIndex, nonNullable } from '../../../../utils/utils'
import { App } from '../../../app/app'
import { Colors, emojis, escapeMd, relativeTimestamp } from '../../../messages/message_pieces'
import { communityEnabled, syncRankedCategory } from '../../guilds'
import { default_elo_settings } from '../../rankings/manage_rankings'
import { calculateMatchNewRatings } from '../scoring/score_matches'

export function addMatchSummaryMessagesListeners(app: App): void {
  app.events.MatchScored.on(async match => {
    await syncMatchSummaryMessages(app, match)
  })
}

/**
 * Sync match summary messages for this match across all guilds the match's ranking is in
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
 * Updates the match's summary message, according to the guild ranking's settings
 */
async function syncMatchSummaryMessageInGuild(
  app: App,
  match: Match,
  guild_ranking: GuildRanking,
): Promise<void> {
  if (!guild_ranking.data.display_settings?.log_matches) return

  const existing_message = (
    await app.db.db
      .select()
      .from(MatchSummaryMessages)
      .where(
        and(
          eq(MatchSummaryMessages.match_id, match.data.id),
          eq(MatchSummaryMessages.guild_id, guild_ranking.data.guild_id),
        ),
      )
  )[0]

  const is_forum = await communityEnabled(app, guild_ranking.data.guild_id)
  const guild = await guild_ranking.guild
  const ranking = await guild_ranking.ranking

  sentry.debug('is_forum', is_forum)

  if (is_forum) {
    const result = await app.bot.utils.syncForumPost({
      target_thread_id: existing_message?.forum_thread_id,
      target_message_id: existing_message?.message_id,
      new_post: async () => ({
        target_forum_id: guild.data.match_results_forum_id,
        body: {
          name: `Match #${match.data.number} in ${ranking.data.name}`,
          message: (await matchSummaryMessageData(app, match)).postdata,
        },
      }),
      update_message: async () => (await matchSummaryMessageData(app, match)).patchdata,
      new_forum: async () => matchSummaryChannelData(app, guild, true),
    })

    let update: Partial<InferInsertModel<typeof MatchSummaryMessages>> = {}
    // update the match summary message in database
    if (result.new_post) {
      // new message <=> new post
      // update or insert match summary message
      update.message_id = result.message.id
      update.forum_thread_id = result.thread_id
      if (existing_message) {
        await app.db.db
          .update(MatchSummaryMessages)
          .set(update)
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
          message_id: result.message.id,
          forum_thread_id: result.thread_id,
        })
      }
    }

    // If a new forum was created, set it to the guild's default match results forum
    result.new_forum && (await guild.update({ match_results_forum_id: result.new_forum.id }))
  } else {
    sentry.debug('syncing match summary message in text channel')
    const result = await app.bot.utils.syncChannelMessage({
      // default to the guild's match results text channel if the guild ranking doesn't have one
      target_channel_id: guild.data.match_results_textchannel_id,
      target_message_id: existing_message?.message_id,
      messageData: async () => matchSummaryMessageData(app, match),
      channelData: async () => matchSummaryChannelData(app, guild),
    })

    // update the match summary message in database
    let update: Partial<InferInsertModel<typeof MatchSummaryMessages>> = {}
    result.is_new_message && (update.message_id = result.message.id)
    if (result.is_new_message) {
      // TODO update or insert match summary message
      if (existing_message) {
        await app.db.db
          .update(MatchSummaryMessages)
          .set(update)
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
          message_id: result.message.id,
          // unset the forum thread id
          forum_thread_id: null,
        })
      }
    }
    result.new_channel &&
      (await guild.update({
        match_results_textchannel_id: result.new_channel.id,
      }))
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

export async function syncMatchSummaryChannel(
  app: App,
  guild_ranking: GuildRanking,
): Promise<void> {
  const is_forum = await communityEnabled(app, guild_ranking.data.guild_id)
  const guild = await guild_ranking.guild
  const ranking = await guild_ranking.ranking

  const result = await app.bot.utils.syncGuildChannel({
    target_channel_id: is_forum
      ? guild.data.match_results_forum_id
      : guild.data.match_results_textchannel_id,
    channelData: async () => await matchSummaryChannelData(app, guild, is_forum),
  })

  if (result.is_new_channel) {
    if (is_forum) {
      await guild.update({ match_results_forum_id: result.channel.id })
    } else {
      await guild.update({ match_results_textchannel_id: result.channel.id })
    }
  }
}

/**
 * Data for a new match summary forum channel
 */
export async function matchSummaryChannelData(
  app: App,
  guild: Guild,
  forum?: boolean,
): Promise<{
  guild_id: string
  data: GuildChannelData
}> {
  let category = (await syncRankedCategory(app, guild)).channel
  return {
    guild_id: guild.data.id,
    data: new GuildChannelData({
      type: forum ? D.ChannelType.GuildForum : D.ChannelType.GuildText,
      parent_id: category.id,
      name: `Match Log`,
      topic: `Ranked matches in this server are recorded here`,
      permission_overwrites: matchSummaryChannelPermissionOverwrites(
        guild.data.id,
        app.bot.application_id,
      ),
      default_sort_order: D.SortOrderType.CreationDate,
      default_reaction_emoji: { emoji_name: '👍', emoji_id: null },
      available_tags: [],
      default_forum_layout: D.ForumLayoutType.ListView,
    }),
  }
}

export function matchSummaryChannelPermissionOverwrites(
  guild_id: string,
  application_id: string,
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
      id: application_id,
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
          rating: nonNullable(p.match_player.rating_before, 'rating before'),
          rd: nonNullable(p.match_player.rd_before, 'rd before'),
        }
      }),
    ),
    (await match.ranking()).data.elo_settings ?? default_elo_settings,
  )

  let details: string = options?.id ? `id: ${match.data.id}` : ''

  const time_finished_str =
    options?.time_finished && match.data.time_finished
      ? `${relativeTimestamp(match.data.time_finished)}`
      : ``

  const winning_team_index = maxIndex(match.data.outcome ?? [])
  const is_draw = winning_team_index === -1

  const embed = {
    title: (options?.ranking_name ? `${escapeMd((await match.ranking()).data.name)} ` : '') 
      + `Match #${match.data.number}`
      // If details only contains the time finished, put it in the title of the embed instead of a separate field.
      + (time_finished_str 
        ? (details
          ? (() => {
              (time_finished_str && (details = `Time finished: ${time_finished_str}\n` + details)); return ``
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
            const diff_text = (diff > 0 ? '+' : '') + diff.toFixed(0)
            return `<@${player.player.data.user_id}> ${rating_after_text} *(${diff_text})*`
          })
          .join('\n'),
        inline: true,
      }
    }), details ? [{
      name: `Details`,
      value: details,
    }] : []].flat(),
    color: Colors.EmbedBackground,
  } // prettier-ignore

  return embed
}
