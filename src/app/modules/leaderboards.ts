import {
  GuildFeature,
} from 'discord-api-types/v10'
import { eq, and } from 'drizzle-orm'

import { DiscordRESTClient } from '../../discord'

import { DbClient } from '../../database/client'
import { GuildLeaderboards, Leaderboards } from '../../database/schema'
import { Guild, GuildLeaderboard, Leaderboard, LeaderboardDivision } from '../../database/models'

import { App } from '../app'
import { AppError, Errors } from '../errors'

import { LeaderboardUpdate } from '../../database/models/types'
import { syncLeaderboardChannelsMessages } from './channels/leaderboard_channels'
import { removeLeaderboardChannelsMessages } from './channels/leaderboard_channels'

/**
 *
 * @param app
 * @param guild The guild creating the leaderboard
 * @param lb_options The new leaderboard's options
 * @returns
 */
export async function createNewLeaderboardInGuild(
  app: App,
  guild: Guild,
  lb_options: {
    name: string
  },
): Promise<{
  new_guild_leaderboard: GuildLeaderboard
  new_leaderboard: Leaderboard
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

  return {
    new_guild_leaderboard,
    new_leaderboard,
  }
}

export async function updateLeaderboard(
  app: App,
  leaderboard: Leaderboard,
  options: LeaderboardUpdate,
) {
  const data = await leaderboard.update(options)

  const guild_leaderboards = await leaderboard.guildLeaderboards()

  await Promise.all(
    guild_leaderboards.map(async (guild_leaderboard) => {
      await syncLeaderboardChannelsMessages(app, guild_leaderboard)
    }),
  )
}

export async function deleteLeaderboard(
  bot: DiscordRESTClient,
  leaderboard: Leaderboard,
): Promise<void> {
  await removeLeaderboardChannelsMessages(bot, leaderboard)
  await leaderboard.delete()
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
