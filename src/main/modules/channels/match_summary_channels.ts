import { InferInsertModel, eq } from 'drizzle-orm'
import { Guild, GuildRanking, Match, Player, Ranking } from '../../../database/models'
import { MatchSummaryMessages } from '../../../database/schema'
import { App } from '../../app/app'
import { events } from '../../app/events'
import { GuildChannelData, MessageData } from '../../../discord-framework'
import { communityEnabled, syncRankedCategory } from '../guilds'
import {
  APIChannelPatchOverwrite,
  ChannelType,
  ForumLayoutType,
  PermissionFlagsBits,
  RESTPostAPIGuildForumThreadsJSONBody,
  SortOrderType,
} from 'discord-api-types/v10'
import { sentry } from '../../../request/sentry'

export function addMatchSummaryMessagesListeners(app: App): void {
  app.on(events.MatchFinished, async (match: Match, players: Player[][]) => {
    await syncMatchSummaryMessages(app, match, players)
  })
}

async function syncMatchSummaryMessages(
  app: App,
  match: Match,
  players: Player[][],
): Promise<void> {
  sentry.debug('syncing match summary messages')
  const ranking = await app.db.rankings.get(match.data.ranking_id)

  const guild_rankings = await ranking.guildRankings()
  const match_summary_messaeges = await app.db.db
    .select()
    .from(MatchSummaryMessages)
    .where(eq(MatchSummaryMessages.match_id, match.data.id))

  await Promise.all(
    guild_rankings.map(async (guild_ranking) => {
      await syncMatchSummaryMessage(
        app,
        match,
        players,
        ranking,
        guild_ranking,
        match_summary_messaeges.find((m) => m.guild_id === guild_ranking.data.guild_id),
      )
    }),
  )
}

async function syncMatchSummaryMessage(
  app: App,
  match: Match,
  players: Player[][],
  ranking: Ranking,
  guild_ranking: GuildRanking,
  match_summary_message:
    | {
        forum_thread_id: string | null
        message_id: string | null
      }
    | undefined,
): Promise<void> {
  // update the match summary message on Discord

  const community_enabled = await communityEnabled(app, guild_ranking.data.guild_id)

  const guild = await guild_ranking.guild()

  if (community_enabled) {
    const result = await app.bot.utils.syncForumPost({
      target_thread_id: match_summary_message?.forum_thread_id,
      target_message_id: match_summary_message?.message_id,
      new_post: async () => {
        return {
          // default to the guild's match results forum if the guild ranking doesn't have one
          target_forum_id:
            guild_ranking.data.match_results_forum_id ?? guild.data.match_results_forum_id,
          body: {
            name: `Match ${match.data.id}`,
            message: matchSummaryMessageData(players).postdata,
          },
        }
      },
      update_message: async () => {
        return matchSummaryMessageData(players).patchdata
      },
      new_forum: async () => {
        return await matchSummaryChannelData(app, await guild_ranking.guild(), ranking, true)
      },
    })

    // update the match summary message in database
    let update: Partial<InferInsertModel<typeof MatchSummaryMessages>> = {}
    if (result.new_post) {
      // there is never a new message without a new post
      update.message_id = result.message.id
      update.forum_thread_id = result.thread_id
    }
    await app.db.db.update(MatchSummaryMessages).set(update)

    // If a new forum was created, set it to the guild's default match results forum
    result.new_forum && (await guild.update({ match_results_forum_id: result.new_forum.id }))
  } else {
    const result = await app.bot.utils.syncChannelMessage({
      // default to the guild's match results text channel if the guild ranking doesn't have one
      target_channel_id:
        guild_ranking.data.match_results_textchannel_id ?? guild.data.match_results_textchannel_id,
      target_message_id: match_summary_message?.message_id,
      messageData: async () => matchSummaryMessageData(players),
      channelData: async () => matchSummaryChannelData(app, guild, ranking, false),
    })

    // update the match summary message in database
    let update: Partial<InferInsertModel<typeof MatchSummaryMessages>> = {}
    result.is_new_message && (update.message_id = result.message.id)
    if (Object.keys(update).length > 0) {
      // unset the forum thread id
      await app.db.db.update(MatchSummaryMessages).set({ ...update, forum_thread_id: null })
    }
    result.new_channel &&
      (await guild.update({
        match_results_textchannel_id: result.new_channel.id,
      }))
  }
}

export function matchSummaryMessageData(players: Player[][]): MessageData {
  return new MessageData({
    content: `Match finished: ${players
      .map((team) => team.map((p) => p.data.name).join(', '))
      .join(' vs. ')}`,
  })
}

/**
 * Data for a new match summary forum channel
 */
export async function matchSummaryChannelData(
  app: App,
  guild: Guild,
  ranking: Ranking,
  forum?: boolean,
): Promise<{
  guild_id: string
  data: GuildChannelData
}> {
  let category = (await syncRankedCategory(app, guild)).channel
  return {
    guild_id: guild.data.id,
    data: new GuildChannelData({
      type: forum ? ChannelType.GuildForum : ChannelType.GuildText,
      parent_id: category.id,
      name: `${ranking.data.name} Matches`,
      topic: `Matches from ${ranking.data.name} are recorded here`,
      permission_overwrites: matchSummaryChannelPermissionOverwrites(
        guild.data.id,
        app.bot.application_id,
      ),
      default_sort_order: SortOrderType.CreationDate,
      default_reaction_emoji: { emoji_name: '👍', emoji_id: null },
      available_tags: [{ name: 'match', emoji_name: '⭐' }],
      default_forum_layout: ForumLayoutType.ListView,
    }),
  }
}

export function matchSummaryChannelPermissionOverwrites(
  guild_id: string,
  application_id: string,
): APIChannelPatchOverwrite[] {
  return [
    {
      // @everyone can't send messages or make threads
      id: guild_id,
      type: 0, // role
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
      type: 1, // user
      allow: (
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.SendMessagesInThreads |
        PermissionFlagsBits.CreatePublicThreads |
        PermissionFlagsBits.CreatePrivateThreads
      ).toString(),
    },
  ]
}
