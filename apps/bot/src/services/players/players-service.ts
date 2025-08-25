import {
  MatchStatus,
  PartialPlayer,
  PartialRanking,
  Player,
  PlayerFlags,
  PlayerStats,
  PlayerStatsSchema,
  Ranking,
  Rating,
  RatingStrategy,
  UserPlayer,
} from '@repo/db/models'
import { GuildInteraction } from '@repo/discord'
import { findDoubleIndex, nonNullable } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { UserError } from '../../errors/user-errors'
import { getUserAccessToken } from '../../routers/oauth'
import { App } from '../../setup/app'
import { GuildAuth, ensureGuildAdminPerms } from '../perms'
import { displayRatingFn } from '../rankings/ratings'
import { updateUserRoleConnectionData } from '../role-connections/role-connections'
import { AppService, LogMethods } from '../service'
import { PlayerDisplay } from './properties'
import { assignRankRolesForUser, calculateRankRolesForPlayer } from './rank-roles'

@LogMethods
export class PlayersService extends AppService {
  /**
   * Gets a player by user and ranking, or registers a new player associated with the user in that ranking.
   */
  async getOrCreatePlayerByUser(
    app: App,
    partial_discord_user: D.APIUser | string,
    p_ranking: PartialRanking,
  ): Promise<UserPlayer> {
    const discord_user_id = typeof partial_discord_user === 'string' ? partial_discord_user : partial_discord_user.id

    let player = await app.db.players.fetchByUser({ user_id: discord_user_id, ranking: p_ranking })

    if (!player) {
      const ranking = await p_ranking.fetch()
      app.logger.debug(`registering ${discord_user_id} in ${ranking}`)

      const discord_user =
        typeof partial_discord_user === 'string'
          ? await app.discord.getUser(partial_discord_user)
          : partial_discord_user

      const app_user = await app.db.users.getOrCreate({
        id: discord_user.id,
        name: discord_user.global_name ?? discord_user.username,
      })

      player = await app.db.players.createWithUser(app_user, ranking, {
        name: app_user.data.name,
        rating: {
          mu: ranking.data.rating_settings.initial_rating.mu,
          rd: ranking.data.rating_settings.initial_rating.rd,
          vol: ranking.data.rating_settings.initial_rating.vol,
        },
      })
    }
    return player
  }

  async getOrCreatePlayerByRole(options: {
    app: App
    auth: GuildAuth
    p_ranking: PartialRanking
    role: {
      id: string
      guild_id: string
    }
  }) {
    const { app, auth, p_ranking, role } = options
    await ensureGuildAdminPerms(app, auth)

    if (!app.config.features.AllowNonUserPlayers) {
      throw new UserError(`Cannot register role <@&${role.id}> as a player. Non-user players are not yet supported`)
    }

    // Get any existing player based on the role and/or name
    let player = await app.db.players.fetchBy({
      role_id: typeof role === 'string' ? role : role?.id,
      ranking: p_ranking,
    })

    if (!player) {
      const ranking = await p_ranking.fetch()
      app.logger.debug(`registering role:${role} in ${ranking}`)

      // Determine the name, and optionally the role+guild.
      let name: string
      let role_id: string | undefined
      let guild_id: string | undefined
      if (role) {
        const full_role = await app.discord.getRole(role.guild_id, role.id)
        name = full_role.name
        role_id = role.id
        guild_id = role.guild_id
      } else {
        throw new Error('Role or name not provided')
      }

      // Create the player
      player = await app.db.players.create({
        ranking,
        name,
        role_id,
        guild_id,
        rating: {
          mu: ranking.data.rating_settings.initial_rating.mu,
          rd: ranking.data.rating_settings.initial_rating.rd,
          vol: ranking.data.rating_settings.initial_rating.vol,
        },
      })
    }

    return player
  }

  /**
   * Returns a player associated with the given role or user
   */
  async getOrCreatePlayer({
    app,
    auth,
    ranking: ranking,
    user,
    role,
  }: {
    app: App
    auth: GuildAuth
    ranking: PartialRanking
    user?: D.APIUser | string
    role?: {
      id: string
      guild_id: string
    }
    name?: string
  }): Promise<Player> {
    if (user) return this.getOrCreatePlayerByUser(app, user, ranking)
    else if (role) return this.getOrCreatePlayerByRole({ app, auth, p_ranking: ranking, role })
    else throw new Error('Either user or role must be provided')
  }

  /**
   * Updates the players' ratings in the database
   *
   * Also updates:
   * - their role connections
   * - the ranking leaderboard messages
   * - their rank roles in every guild ranking they're in, if specified and not too many players
   */
  async updatePlayerRatings(
    app: App,
    auth: GuildAuth | 'rescored matches',
    ranking: Ranking,
    update_data: { player: PartialPlayer; rating: Rating }[],
    options?: { assign_rank_roles: boolean },
  ) {
    auth !== 'rescored matches' && (await ensureGuildAdminPerms(app, auth))

    app.logger.debug(`updatePlayerRatings for ${update_data.length} players in ${ranking}`)

    await app.db.players.updateRatings(update_data)

    // Fetch all players again to get the updated data
    const all_players = await app.db.players.fetchMany({
      player_ids: update_data.map(u => u.player.data.id),
    })

    // Update player role connection data
    await Promise.all([
      Promise.all(
        all_players.map(async player => {
          // For each player to update, update role connections
          if (app.config.features.RoleConnections && player.data.user_id) {
            app.logger.debug(`Updating role connections for ${player.data.user_id}`)
            const access_token = await getUserAccessToken(app, player.data.user_id, [
              D.OAuth2Scopes.RoleConnectionsWrite,
            ])

            if (access_token) {
              app.logger.debug(`Found access token for ${player.data.user_id}. Updating role connections.`)
              await updateUserRoleConnectionData(app, access_token, player)
            }
          }
        }),
      ),
      // Sync messages for the ranking leaderboard
      app.lbs.syncMessages(app, ranking),

      // Assign rank roles
      async () => {
        if (options?.assign_rank_roles) {
          if (all_players.length > 8) {
            app.logger.debug(`Skipping rank role assignment for ${all_players.length} players (too many)`)
          } else {
            app.logger.debug(`Assigning rank roles to ${all_players.length} players`)
            const guild_rankings = await app.db.guild_rankings.fetch({ ranking_id: ranking.data.id })

            await Promise.all(
              guild_rankings.map(async ({ guild_ranking }) => {
                await Promise.all(
                  all_players.map(async player => {
                    // If player is associated with a Discord user
                    if (player.data.user_id) await assignRankRolesForUser(app, player.data.user_id, guild_ranking)
                  }),
                )
              }),
            )
          }
        }
      },
    ])
  }

  async setPlayerDisabled(app: App, auth: GuildAuth, player: Player, disabled: boolean) {
    await ensureGuildAdminPerms(app, auth)

    await player.update({
      flags: disabled ? player.data.flags | PlayerFlags.Disabled : player.data.flags & ~PlayerFlags.Disabled,
    })
  }

  /**
   * If the player is associated with a user or role, update their name in the database.
   */
  async refreshPlayerName(app: App, player: Player) {
    let new_name: string
    if (player.data.user_id) {
      const discord_user = await app.discord.getUser(player.data.user_id)
      new_name = discord_user.global_name ?? discord_user.username
      await app.db.users.get(discord_user.id).update({ name: new_name })
    } else if (player.data.role_id) {
      if (!player.data.guild_id) throw new Error(`${player} has a role but no guild`)
      const role = await app.discord.getRole(player.data.guild_id, player.data.role_id)
      new_name = role.name
    } else {
      return
    }
    // Update player and user
    await Promise.all([player.update({ name: new_name })])
  }

  async deletePlayer(app: App, player: Player, auth: GuildInteraction): Promise<void> {
    await ensureGuildAdminPerms(app, auth)
    const ranking = await player.ranking()
    await player.delete()
    await app.lbs.syncMessages(app, ranking)
  }

  /**
   * If the player is associated with a user or role, return their mention.
   * Otherwise, return their name.
   */
  mentionOrName(player: Player): string {
    return player.data.user_id
      ? `<@${player.data.user_id}>`
      : player.data.role_id
        ? `<@&${player.data.role_id}>`
        : player.data.name
  }

  /**
   * Determine a player's wins, losses, draws, winrate, and place on the leaderboard
   * and saves it to the database
   */
  async updatePlayerStats(app: App, player: Player, lb_players?: PlayerDisplay[]): Promise<PlayerStats> {
    const ranking = await player.ranking()
    lb_players = lb_players ?? (await app.lbs.getOrderedPlayers(app, ranking))
    const matches = await app.db.matches.getMany({ player_ids: [player.data.id] })
    const grs = await app.db.guild_rankings.fetch({ ranking_id: ranking.data.id })

    // Get the display rating
    const display_rating: PlayerStats['display_rating'] = displayRatingFn(app, ranking)(player.data.rating)

    // Determine whether the rd should be displayed
    if (
      ranking.data.rating_settings.rating_strategy === RatingStrategy.Glicko ||
      ranking.data.rating_settings.rating_strategy === RatingStrategy.TrueSkill ||
      ranking.data.rating_settings.rating_strategy === RatingStrategy.Bayesian
    ) {
      display_rating['rd'] = Math.round(player.data.rating.rd ?? ranking.data.rating_settings.initial_rating.rd)
    }

    // Get the leaderboard place
    const ranked_lb_players = lb_players.filter(p => !p.is_provisional)
    const player_index = ranked_lb_players.findIndex(p => p.player.data.id === player.data.id)
    const lb_place = player_index === -1 ? null : player_index + 1
    const max_lb_place = ranked_lb_players.length > 0 ? ranked_lb_players.length : null

    let wins = 0
    let losses = 0
    let draws = 0

    let total_opponent_rating = 0
    let total_opponents = 0

    let current_winstreak = 0
    let longest_winstreak = 0

    let rating_history: {
      points: number
      is_provisional?: boolean
      time: number
    }[] = []

    for (const match of matches) {
      // Calculate wins, losses, draws
      const [team_idx, player_idx] = nonNullable(
        findDoubleIndex(match.team_players, p => p.player.data.id === player.data.id),
        'player index',
      )

      const { winning_team_indices, is_draw } = app.matches.getProperties(match.match)

      if (!winning_team_indices) continue // If this match isn't finished, it's not counted
      if (is_draw) draws++
      else if (winning_team_indices.includes(team_idx)) {
        wins++
        current_winstreak++
        longest_winstreak = Math.max(longest_winstreak, current_winstreak)
      } else {
        losses++
      }

      // Update rating history
      const player_rating = match.team_players[team_idx][player_idx].rating
      const player_display_rating = displayRatingFn(app, ranking)(player_rating)

      // Update opponent ratings
      const other_team_players = match.team_players.filter((_, i) => team_idx !== i).flat()
      const sum = other_team_players.reduce((acc, opponent) => {
        const opponent_rating = displayRatingFn(app, ranking)(opponent.rating)
        return acc + opponent_rating.points
      }, 0)
      total_opponent_rating += sum
      total_opponents += other_team_players.length

      if (match.match.data.time_finished) {
        rating_history.push({
          ...player_display_rating,
          time: match.match.data.time_finished.getTime(),
        })
      }
    }

    const avg_opponent_rating = total_opponents === 0 ? null : total_opponent_rating / total_opponents

    // Add the latest rating to the rating history
    rating_history.push({
      ...display_rating,
      time: new Date().getTime(),
    })

    // Calculate winrate
    const total = wins + losses
    const winrate = total === 0 ? null : wins / total

    // Calculate featured rank roles for each guild the player is in.
    var rank_roles: Record<string, string[]> = {}
    for (const gr of grs) {
      const guild_rank_roles = await calculateRankRolesForPlayer(app, player, gr.guild_ranking)
      const role_ids = guild_rank_roles.filter(([_, has_role]) => has_role).map(([role_id, _]) => role_id)
      rank_roles[gr.guild_ranking.data.guild_id] = role_ids
    }

    const stats = {
      display_rating,
      wins,
      losses,
      draws,
      winrate,
      current_winstreak,
      longest_winstreak,
      avg_opponent_rating,
      lb_place,
      max_lb_place,
      rating_history,
      rank_roles,
      stats_last_refreshed: new Date().getTime(),
    }

    await player.update({ stats })

    return stats
  }

  /**
   * Returns the player's stats
   * @param fetch If false, returns undefined if there is a parse error or they are undefined
   * If true, fetches them if they are unavailable or old
   */
  async getPlayerStats<T extends boolean = true>(
    app: App,
    player: Player,
    fetch: T = true as T,
  ): Promise<T extends true ? PlayerStats : PlayerStats | undefined> {
    const parse_result = PlayerStatsSchema.safeParse(player.data.stats)

    if (parse_result.success) {
      if (fetch) {
        // Check if the stats are older than 1 minute
        const stats_age = new Date().getTime() - parse_result.data.stats_last_refreshed
        if (stats_age > 1000 * 60 * 1) {
          return this.updatePlayerStats(app, player)
        }
      }
      return parse_result.data
    } else {
      app.logger.debug(`failed parsing stats for player ${player}`)
      return (fetch ? this.updatePlayerStats(app, player) : undefined) as T extends true
        ? PlayerStats
        : PlayerStats | undefined
    }
  }

  /**
   * @returns the player's rating, and time since last match
   * at the specified time.
   * If the previous match has no time finished or no information
   * about the player's rating, returns null for that value
   */
  async getInfoAtTime(app: App, player: Player, time: Date) {
    // Get the most recent match finished before the specified time
    const result = await app.db.matches.getMany({
      player_ids: [player.data.id],
      finished_before: time,
      status: MatchStatus.Finished,
      limit: 1,
      earliest_first: false,
    })

    const ranking = await player.ranking()

    let seconds: number | null = null
    let rating: Rating | undefined | null = null

    if (result.length !== 0) {
      const { match, team_players } = result[0]

      const last_time = match.data.time_finished

      seconds = last_time ? Math.floor((time.getTime() - last_time.getTime()) / 1000) : null

      // Determine the rating after the match
      const scores = app.scoring.scoreMatch({
        app,
        players: team_players,
        match: match,
        rating_settings: ranking.data.rating_settings,
      })

      // Determine the player's index in team_players
      const idx = findDoubleIndex(team_players, p => p.player.data.id === player.data.id)

      if (!scores) throw new Error(`No score for player ${player.data.id} in finished match ${match.data.id}`)
      if (!idx) throw new Error(`Expected to find match player ${player.data.id} in match ${match.data.id}`)

      rating = scores[idx[0]][idx[1]]
    }

    return {
      seconds,
      rating: rating ?? ranking.data.rating_settings.initial_rating,
    }
  }
}
