import {
  APIChannelPatchOverwrite,
  APIEmbed,
  APIGuildCreateOverwrite,
  APIOverwrite,
  ChannelType,
  GuildFeature,
  PermissionFlagsBits,
  RESTPatchAPIChannelJSONBody,
  RESTPostAPIGuildChannelJSONBody,
} from 'discord-api-types/v10'
import { eq, and } from 'drizzle-orm'

import { config } from '../../utils/globals'
import { DiscordRESTClient } from '../../discord'

import { DbClient } from '../../database/client'
import { GuildLeaderboards, Leaderboards } from '../../database/schema'
import { Guild, GuildLeaderboard, Leaderboard, LeaderboardDivision } from '../../database/models'

import { App } from '../app'
import queue from '../views/views/queue'
import { messageLink, Colors } from '../helpers/messages/message_pieces'
import { AppError, Errors } from '../errors'

import { syncRankedCategory } from './guilds'
import { LeaderboardUpdate } from '../../database/models/types'
import { MessageData, GuildChannelData } from '../../discord/rest/objects'

/**
 *
 * @param app
 * @param guild
 * @param lb_options
 * @returns
 */
export async function createNewLeaderboardInGuild(
  app: App,
  guild: Guild,
  lb_options: {
    name: string
  },
): Promise<{
  display_message_link: string
  matches_channel_link: string
}> {
  // make sure a leaderboard from this guild with the same name doesn't already exist
  let same_name_leaderboard = (
    await app.db.db
      .select()
      .from(GuildLeaderboards)
      .innerJoin(Leaderboards, eq(GuildLeaderboards.leaderboard_id, Leaderboards.id))
      .where(
        and(eq(GuildLeaderboards.guild_id, guild.data.id), eq(Leaderboards.name, lb_options.name)),
      )
  )[0]
  if (same_name_leaderboard) {
    throw new AppError(`You already have a leaderboard named \`${lb_options.name}\``)
  }

  const new_leaderboard = await app.db.leaderboards.create({
    name: lb_options.name,
    owner_guild_id: guild.data.id,
    time_created: new Date(),
  })

  await new_leaderboard.createDivision(
    {
      time_created: new Date(),
    },
    true,
  )

  const new_guild_leaderboard = await app.db.guild_leaderboards.create(guild, new_leaderboard, {})

  await syncLeaderboardChannelsMessages(app, new_guild_leaderboard)

  let display_message_link = messageLink(
    guild.data.id,
    new_guild_leaderboard.data.display_channel_id || '0',
    new_guild_leaderboard.data.display_message_id || '0',
  )

  let matches_channel_link = ''

  return {
    display_message_link,
    matches_channel_link,
  }
}

export async function updateLeaderboard(
  app: App,
  leaderboard: Leaderboard | number,
  options: LeaderboardUpdate,
) {
  if (typeof leaderboard === 'number') {
    leaderboard = await getLeaderboardById(app.db, leaderboard)
  }
  await leaderboard.update(options)

  const guild_leaderboards = await leaderboard.guildLeaderboards()

  await Promise.all(
    guild_leaderboards.map(async (guild_leaderboard) => {
      await syncLeaderboardChannelsMessages(app, guild_leaderboard)
    }),
  )
}

export async function syncLeaderboardChannelsMessages(
  app: App,
  guild_leaderboard: GuildLeaderboard,
): Promise<void> {
  await syncLbDisplayChannel(app, guild_leaderboard)
  await syncLbDisplayMessage(app, guild_leaderboard)

  if (config.features.QUEUE_MESSAGE) {
    await haveLeaderboardQueueMessage(app, guild_leaderboard)
  }
}

async function getLbChanneldata(
  app: App,
  guild: Guild,
  leaderboard: Leaderboard,
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

async function syncLbDisplayChannel(app: App, guild_leaderboard: GuildLeaderboard): Promise<void> {
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
  guild_leaderboard: GuildLeaderboard,
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

function generateLeaderboardMessage(data: {
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

export async function haveLeaderboardQueueMessage(
  app: App,
  guild_leaderboard: GuildLeaderboard,
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

function leaderboardChannelPermissionOverwrites(
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

export async function deleteLeaderboard(
  bot: DiscordRESTClient,
  leaderboard: Leaderboard,
): Promise<void> {
  const guild_leaderboards = await leaderboard.guildLeaderboards()

  await Promise.all(
    guild_leaderboards.map(async (guild_leaderboard) => {
      await deleteLeaderboardFromDiscord(bot, guild_leaderboard)
    }),
  )

  await leaderboard.delete()
}

async function deleteLeaderboardFromDiscord(
  bot: DiscordRESTClient,
  guild_leaderboard: GuildLeaderboard,
): Promise<void> {
  await bot.utils.deleteChannelIfExists({
    target_channel_id: guild_leaderboard.data.display_channel_id,
  })
}

export async function getLeaderboardCurrentDivision(
  client: DbClient,
  leaderboard: Leaderboard,
): Promise<LeaderboardDivision> {
  if (!leaderboard.data.default_division_id) throw new Error('Leaderboard has no current division')
  let division = client.leaderboard_divisions.getOrFail(leaderboard.data.default_division_id)
  return division
}

export async function getLeaderboardById(db: DbClient, id: number): Promise<Leaderboard> {
  const leaderboard = await db.leaderboards.get(id)
  if (!leaderboard) throw new Errors.UnknownLeaderboard()
  return leaderboard
}

export async function forumOrText(app: App, guild: Guild): Promise<'text' | 'forum'> {
  const discord_guild = await app.bot.getGuild(guild.data.id)
  return discord_guild.features.includes(GuildFeature.Community) ? 'forum' : 'text'
}
