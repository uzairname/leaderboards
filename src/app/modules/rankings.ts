import { GuildFeature } from 'discord-api-types/v10'
import { eq, and } from 'drizzle-orm'

import { DiscordRESTClient } from '../../discord'

import { DbClient } from '../../database/client'
import { GuildRankings, Rankings } from '../../database/schema'
import { Guild, GuildRanking, Ranking, RankingDivision } from '../../database/models'

import { App } from '../app'
import { AppError, Errors } from '../messages/errors'

import { LeaderboardUpdate } from '../../database/models/types'
import { syncLeaderboardChannelsMessages } from './channels/leaderboard_channels'
import { removeRankingChannelsMessages } from './channels/leaderboard_channels'

/**
 *
 * @param app
 * @param guild The guild creating the ranking
 * @param ranking_options The new ranking's options
 * @returns
 */
export async function createNewRankingInGuild(
  app: App,
  guild: Guild,
  ranking_options: {
    name: string
  },
): Promise<{
  new_guild_ranking: GuildRanking
  new_ranking: Ranking
}> {
  // make sure a leaderboard from this guild with the same name doesn't already exist
  let same_name_leaderboard = (
    await app.db.conn
      .select()
      .from(GuildRankings)
      .innerJoin(Rankings, eq(GuildRankings.ranking_id, Rankings.id))
      .where(
        and(eq(GuildRankings.guild_id, guild.data.id), eq(Rankings.name, ranking_options.name)),
      )
  )[0]
  if (same_name_leaderboard) {
    throw new AppError(`You already have a leaderboard named \`${ranking_options.name}\``)
  }

  const new_ranking = await app.db.rankings.create({
    name: ranking_options.name,
    time_created: new Date(),
  })

  await new_ranking.createDivision(
    {
      time_created: new Date(),
    },
    true,
  )

  const new_guild_leaderboard = await app.db.guild_rankings.create(guild, new_ranking, {
    is_admin: true,
  })

  await syncLeaderboardChannelsMessages(app, new_guild_leaderboard)

  return {
    new_guild_ranking: new_guild_leaderboard,
    new_ranking: new_ranking,
  }
}

export async function updateLeaderboard(
  app: App,
  leaderboard: Ranking,
  options: LeaderboardUpdate,
) {
  await leaderboard.update(options)

  const guild_leaderboards = await leaderboard.guildLeaderboards()
  await Promise.all(
    guild_leaderboards.map(async (guild_leaderboard) => {
      await syncLeaderboardChannelsMessages(app, guild_leaderboard)
    }),
  )
}

export async function deleteRanking(bot: DiscordRESTClient, ranking: Ranking): Promise<void> {
  await removeRankingChannelsMessages(bot, ranking)
  await ranking.delete()
}

export async function getRankingCurrentDivision(
  client: DbClient,
  ranking: Ranking,
): Promise<RankingDivision> {
  if (!ranking.data.current_division_id) throw new Error('Leaderboard has no current division')
  let division = client.ranking_divisions.getOrFail(ranking.data.current_division_id)
  return division
}

export async function getRankingById(db: DbClient, id: number): Promise<Ranking> {
  const ranking = await db.rankings.get(id)
  if (!ranking) throw new Errors.UnknownRanking()
  return ranking
}

export async function forumOrText(app: App, guild: Guild): Promise<'text' | 'forum'> {
  const discord_guild = await app.bot.getGuild(guild.data.id)
  return discord_guild.features.includes(GuildFeature.Community) ? 'forum' : 'text'
}
