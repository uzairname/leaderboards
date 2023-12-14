import { eq, and } from 'drizzle-orm'

import { GuildRankings, Rankings } from '../../../database/schema'
import { Guild, GuildRanking, Ranking } from '../../../database/models'
import { RankingUpdate } from '../../../database/models/types'
import {
  default_elo_settings,
  default_players_per_team,
  default_num_teams,
} from '../../../database/models/models/rankings'

import { App } from '../../app/app'
import { UserError } from '../../app/errors'
import { events } from '../../app/events'

import { syncGuildRankingChannelsMessages } from './ranking_channels'
import { removeRankingChannelsMessages } from './ranking_channels'

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
    throw new UserError(`You already have a ranking named \`${lb_options.name}\``)
  }

  const new_ranking = await app.db.rankings.create({
    name: lb_options.name,
    time_created: new Date(),
    players_per_team: default_players_per_team,
    num_teams: default_num_teams,
    elo_settings: default_elo_settings,
    // TODO: specify players per team and num teams
  })

  const new_guild_ranking = await app.db.guild_rankings.create(guild, new_ranking, {
    is_admin: true,
  })

  await app.events.GuildRankingCreated.emit(new_guild_ranking)

  return {
    new_guild_ranking: new_guild_ranking,
    new_ranking: new_ranking,
  }
}

export async function updateRanking(app: App, ranking: Ranking, options: RankingUpdate) {
  await ranking.update(options)
  await app.events.RankingUpdated.emit(ranking)
}

export async function deleteRanking(app: App, ranking: Ranking): Promise<void> {
  await removeRankingChannelsMessages(app.bot, ranking)
  await ranking.delete()
}
