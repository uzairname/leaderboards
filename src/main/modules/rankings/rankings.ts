import { eq, and } from 'drizzle-orm'

import { GuildRankings, Rankings } from '../../../database/schema'
import { Guild, GuildRanking, Ranking } from '../../../database/models'
import { RankingInsert, RankingUpdate } from '../../../database/types'
import {
  default_elo_settings,
  default_players_per_team,
  default_num_teams,
} from '../../../database/models/models/rankings'

import { App } from '../../app/app'
import { UserError } from '../../app/errors'
import { removeRankingLbChannels } from './ranking_channels'
import { sentry } from '../../../request/sentry'

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
  options: {
    name: string
    num_teams?: number
    players_per_team?: number
    elo_settings?: RankingInsert['elo_settings']
  },
): Promise<{
  new_guild_ranking: GuildRanking
  new_ranking: Ranking
}> {
  // make sure a ranking from this guild with the same name doesn't already exist
  validateRanking(options)

  let same_name_ranking = (
    await app.db.db
      .select()
      .from(GuildRankings)
      .innerJoin(Rankings, eq(GuildRankings.ranking_id, Rankings.id))
      .where(and(eq(GuildRankings.guild_id, guild.data.id), eq(Rankings.name, options.name)))
  )[0]
  if (same_name_ranking) {
    throw new UserError(`You already have a ranking named \`${options.name}\``)
  }

  const new_ranking = await app.db.rankings.create({
    name: options.name,
    time_created: new Date(),
    players_per_team: options.players_per_team || default_players_per_team,
    num_teams: options.num_teams || default_num_teams,
    elo_settings: options.elo_settings || default_elo_settings,
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

export async function updateRanking(
  app: App,
  ranking: Ranking,
  options: Pick<RankingUpdate, 'name' | 'elo_settings'>,
) {
  validateRanking(options)
  await ranking.update(options)
  await app.events.RankingUpdated.emit(ranking)
}

export async function deleteRanking(app: App, ranking: Ranking): Promise<void> {
  await removeRankingLbChannels(app, ranking)
  await ranking.delete()
}

export async function validateRanking(options: RankingInsert) {
  if (options.name && options.name.length > 32) {
    throw new UserError('Ranking names must be 32 characters or less')
  }
  if (options.num_teams && (options.num_teams < 2 || options.num_teams > 4)) {
    throw new UserError('Number of teams must be between 2 and 5')
  }
  if (options.players_per_team && (options.players_per_team < 1 || options.players_per_team > 25)) {
    throw new UserError('Players per team must be between 1 and 5')
  }
}
