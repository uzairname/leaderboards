import { Guild, GuildRanking, Ranking } from '../../../../database/models'
import { GuildRankingDisplaySettings } from '../../../../database/models/guildrankings'
import {
  EloSettings,
  MatchmakingSettings,
  RankingInsert,
  RankingUpdate,
} from '../../../../database/models/rankings'
import { DeferContext } from '../../../../discord-framework'
import { App } from '../../../app/App'
import { UserError, UserErrors } from '../../errors/UserError'
import {
  syncGuildRankingLbMessage,
  syncRankingLbMessages,
} from '../leaderboard/leaderboard-message'


export const default_num_teams = 2
export const default_players_per_team = 1

export const default_elo_settings: EloSettings = {
  prior_mu: 50,
  prior_rd: 50 / 3,
}
export const default_display_settings: GuildRankingDisplaySettings = {
  log_matches: true,
  leaderboard_message: true,
}
export const default_matchmaking_settings: MatchmakingSettings = {
  queue_enabled: true,
  direct_challenge_enabled: true,
}

export const max_ranking_name_length = 48
export const max_num_teams = 4
export const max_players_per_team = 12

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
    elo_settings?: EloSettings
    display_settings?: GuildRankingDisplaySettings
    matchmaking_settings?: MatchmakingSettings
  },
): Promise<{
  new_guild_ranking: GuildRanking
  new_ranking: Ranking
}> {
  options = validateRankingOptions(options)

  // make sure a ranking from this guild with the same name doesn't already exist
  const same_name_ranking = await app.db.guild_rankings.getByName(guild.data.id, options.name)
  if (same_name_ranking) {
    throw new UserError(`This server already has a ranking called \`${options.name}\``)
  }

  const new_ranking = await app.db.rankings.create({
    name: options.name,
    players_per_team: options.players_per_team || default_players_per_team,
    num_teams: options.num_teams || default_num_teams,
    elo_settings: options.elo_settings || default_elo_settings,
    matchmaking_settings: options.matchmaking_settings || default_matchmaking_settings,
  })

  const new_guild_ranking = await app.db.guild_rankings.create(guild, new_ranking, {
    is_admin: true,
    display_settings: options.display_settings || default_display_settings,
  })

  await syncRankingLbMessages(app, new_ranking)

  app.syncDiscordCommands(guild)

  return { new_guild_ranking, new_ranking }
}

export async function updateRanking(
  app: App,
  ranking: Ranking,
  options: RankingUpdate,
  ctx?: DeferContext<any>,
): Promise<void> {
  validateRankingOptions(options)
  await ranking.update(options)
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: ranking.data.id })

  for (const item of guild_rankings) {
    if (options.name || options.matchmaking_settings) {
      app.config.IsDev &&
        ctx?.followup({ content: `syncing commands for guild ${item.guild.data.name}`, flags: 64 })
      app.syncDiscordCommands(item.guild)
    }
    app.config.IsDev &&
      ctx?.followup({ content: `syncing lb for guild ${item.guild.data.name}`, flags: 64 })
    await syncGuildRankingLbMessage(app, item.guild_ranking)
  }
  app.config.IsDev && ctx?.followup({ content: `done`, flags: 64 })

  // const result = await Promise.all(
  //   guild_rankings.map(item =>
  //     Promise.all([
  //       (async () => {
  //         if (options.name || options.matchmaking_settings) {
  //           await app.syncDiscordCommands(item.guild)
  //         }
  //       })(),
  //       syncGuildRankingLbMessage(app, item.guild_ranking),
  //     ]),
  //   ),
  // )
}

export async function deleteRanking(app: App, ranking: Ranking): Promise<void> {
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: ranking.data.id })
  await Promise.all(
    guild_rankings.map(async item => {
      await app.discord.deleteMessageIfExists(
        item.guild_ranking.data.leaderboard_channel_id,
        item.guild_ranking.data.leaderboard_message_id,
      )
    }),
  )
  await ranking.delete()

  await Promise.all(
    guild_rankings.map(async item => {
      app.syncDiscordCommands(item.guild)
    }),
  )
}


export function validateRankingOptions<T extends Partial<RankingInsert>>(o: T): T {
  if (o.name !== undefined) {
    if (!o.name) throw new UserError(`Ranking name cannot be empty`)

    if (o.name.length > max_ranking_name_length)
      throw new UserError(`Ranking names must be ${max_ranking_name_length} characters or less`)
  }

  if (o.num_teams !== undefined) {
    if (!o.num_teams || isNaN(o.num_teams))
      throw new UserErrors.ValidationError(`Number of teams must be a number`)

    if (o.num_teams < 2 || o.num_teams > max_num_teams)
      throw new UserErrors.ValidationError(`Number of teams must be between 2 and ${max_num_teams}`)
  }

  if (o.players_per_team !== undefined) {
    if (!o.players_per_team || isNaN(o.players_per_team))
      throw new UserErrors.ValidationError(`Players per team must be a number`)
    if (o.players_per_team < 1 || o.players_per_team > max_players_per_team)
      throw new UserErrors.ValidationError(
        `Players per team must be between 1 and ${max_players_per_team}`,
      )
  }

  return o
}
