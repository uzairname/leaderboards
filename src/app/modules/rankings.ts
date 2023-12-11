import { GuildFeature } from 'discord-api-types/v10'
import { eq, and } from 'drizzle-orm'

import { DiscordRESTClient } from '../../discord-framework'

import { DbClient } from '../../database/client'
import { GuildRankings, Rankings } from '../../database/schema'
import { Guild, GuildRanking, Ranking } from '../../database/models'

import { App } from '../app'
import { AppError, Errors } from '../errors'

import { RankingUpdate } from '../../database/models/types'
import { syncLeaderboardChannelsMessages } from './channels/leaderboard_channels'
import { removeLeaderboardChannelsMessages } from './channels/leaderboard_channels'

/**
 *
 * @param app
 * @param guild The guild creating the ranking
 * @param lb_options The new ranking's options
 * @returns
 */
export async function createNewRankingInGuild(
  app: App,
  guild: Guild,
  lb_options: {
    name: string
  },
): Promise<{
  new_guild_ranking: GuildRanking
  new_ranking: Ranking
}> {
  // make sure a ranking from this guild with the same name doesn't already exist
  let same_name_ranking = (
    await app.db.db
      .select()
      .from(GuildRankings)
      .innerJoin(Rankings, eq(GuildRankings.ranking_id, Rankings.id))
      .where(and(eq(GuildRankings.guild_id, guild.data.id), eq(Rankings.name, lb_options.name)))
  )[0]
  if (same_name_ranking) {
    throw new AppError(`You already have a ranking named \`${lb_options.name}\``)
  }

  const new_ranking = await app.db.rankings.create({
    name: lb_options.name,
    time_created: new Date(),
    players_per_team: 1,
    num_teams: 2,
    // TODO: specify players per team and num teams
  })

  const new_guild_ranking = await app.db.guild_rankings.create(guild, new_ranking, {
    is_admin: true,
  })

  await syncLeaderboardChannelsMessages(app, new_guild_ranking)

  return {
    new_guild_ranking: new_guild_ranking,
    new_ranking: new_ranking,
  }
}

export async function updateRanking(app: App, ranking: Ranking, options: RankingUpdate) {
  await ranking.update(options)

  const guild_rankings = await ranking.guildRankings()
  await Promise.all(
    guild_rankings.map(async (guild_ranking) => {
      await syncLeaderboardChannelsMessages(app, guild_ranking)
    }),
  )
}

export async function deleteRanking(
  bot: DiscordRESTClient,
  ranking: Ranking,
): Promise<void> {
  await removeLeaderboardChannelsMessages(bot, ranking)
  await ranking.delete()
}

export async function forumOrText(app: App, guild: Guild): Promise<'text' | 'forum'> {
  const discord_guild = await app.bot.getGuild(guild.data.id)
  return discord_guild.features.includes(GuildFeature.Community) ? 'forum' : 'text'
}
