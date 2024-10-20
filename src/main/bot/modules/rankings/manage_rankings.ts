import { and, eq } from 'drizzle-orm'
import { App } from '../../../app-context/app-context'
import { Guild, GuildRanking, Ranking } from '../../../database/models'
import { GuildRankings, Rankings } from '../../../database/schema'
import { GuildRankingInsert, RankingInsert } from '../../../database/types'
import { AppError, AppErrors } from '../../../errors'
import { syncDiscordCommands } from '../../view_manager/manage_views'
import { syncGuildRankingLbMessage } from '../leaderboard/leaderboard_messages'

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
    display_settings?: GuildRankingInsert['display_settings']
  },
): Promise<{
  new_guild_ranking: GuildRanking
  new_ranking: Ranking
}> {
  options = validateRankingOptions(options)

  // make sure a ranking from this guild with the same name doesn't already exist
  let same_name_ranking = (
    await app.db.db
      .select()
      .from(GuildRankings)
      .innerJoin(Rankings, eq(GuildRankings.ranking_id, Rankings.id))
      .where(and(eq(GuildRankings.guild_id, guild.data.id), eq(Rankings.name, options.name)))
  )[0]
  if (same_name_ranking) {
    throw new AppError(`You already have a ranking named \`${options.name}\``)
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
    display_settings: options.display_settings || default_display_settings,
  })

  await syncDiscordCommands(app, guild.data.id)

  return { new_guild_ranking, new_ranking }
}

export async function updateRanking(app: App, ranking: Ranking, options: RankingInsert) {
  await ranking.update(options)
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: ranking.data.id })
  await Promise.all(
    guild_rankings.map(async item => {
      await syncGuildRankingLbMessage(app, item.guild_ranking)
    }),
  )
}

export async function deleteRanking(app: App, ranking: Ranking): Promise<void> {
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: ranking.data.id })
  await Promise.all(
    guild_rankings.map(async item => {
      await app.bot.utils.deleteMessageIfExists(
        item.guild_ranking.data.leaderboard_channel_id,
        item.guild_ranking.data.leaderboard_message_id,
      )
    }),
  )
  await ranking.delete()

  await Promise.all(
    guild_rankings.map(async item => {
      await syncDiscordCommands(app, item.guild.data.id)
    }),
  )
}

export const default_num_teams = 2
export const default_players_per_team = 1
export const default_elo_settings = {
  initial_rating: 50,
  initial_rd: 50 / 3,
}
export const default_display_settings = {
  log_matches: true,
  leaderboard_message: true,
}

export const max_ranking_name_length = 32
export const max_num_teams = 4
export const max_players_per_team = 12

export function validateRankingOptions<T extends Partial<RankingInsert>>(o: T): T {
  if (o.name !== undefined) {
    if (!o.name) throw new AppError(`Ranking name cannot be empty`)

    if (o.name.length > max_ranking_name_length)
      throw new AppError(`Ranking names must be ${max_ranking_name_length} characters or less`)
  }

  if (o.num_teams !== undefined) {
    if (!o.num_teams || isNaN(o.num_teams))
      throw new AppErrors.ValidationError(`Number of teams must be a number`)

    if (o.num_teams < 2 || o.num_teams > max_num_teams)
      throw new AppErrors.ValidationError(`Number of teams must be between 2 and ${max_num_teams}`)
  }

  if (o.players_per_team !== undefined) {
    if (!o.players_per_team || isNaN(o.players_per_team))
      throw new AppErrors.ValidationError(`Players per team must be a number`)
    if (o.players_per_team < 1 || o.players_per_team > max_players_per_team)
      throw new AppErrors.ValidationError(
        `Players per team must be between 1 and ${max_players_per_team}`,
      )
  }

  return o
}
