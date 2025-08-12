import { PartialPlayer, PartialRanking, Player, PlayerFlags, Ranking, Rating, UserPlayer } from '@repo/db/models'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../logging/sentry'
import { getUserAccessToken } from '../../routers/oauth'
import { App } from '../../setup/app'
import { syncRankingLbMessages } from '../leaderboard/manage'
import { updateUserRoleConnectionData } from '../role-connections/role-connections'
import { updateRankRolesForPlayer } from './rank-roles'

/**
 * Gets a player by user and ranking, or registers a new player associated with the user in that ranking.
 */
export async function getOrCreatePlayerByUser(
  app: App,
  partial_discord_user: D.APIUser | string,
  p_ranking: PartialRanking,
): Promise<UserPlayer> {
  const discord_user_id = typeof partial_discord_user === 'string' ? partial_discord_user : partial_discord_user.id
  sentry.debug(`getOrCreatePlayerByUser: ${discord_user_id} in ${p_ranking}`)

  let player = await app.db.players.fetchByUser({ user_id: discord_user_id, ranking: p_ranking })

  if (!player) {
    const ranking = await p_ranking.fetch()
    sentry.debug(`registering ${discord_user_id} in ${ranking}`)

    const discord_user =
      typeof partial_discord_user === 'string' ? await app.discord.getUser(partial_discord_user) : partial_discord_user

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

/**
 * Returns a player associated with the given role and user
 */
export async function getOrCreatePlayer(options: {
  app: App
  ranking: PartialRanking
  user?: D.APIUser | string
  role?: {
    id: string
    guild_id: string
  }
  name?: string
}): Promise<Player> {
  sentry.debug(`getOrCreatePlayer: user:${options.user} role:${options.role} in ${options.ranking}`)

  const { app } = options

  if (options.user) return getOrCreatePlayerByUser(options.app, options.user, options.ranking)

  // User is not specified.

  // Get any existing player based on the role and/or name
  let player = await app.db.players.fetchBy({
    role_id: typeof options.role === 'string' ? options.role : options.role?.id,
    name: options.name,
    ranking: options.ranking,
  })

  if (!player) {
    const ranking = await options.ranking.fetch()
    sentry.debug(`registering user:${options.user} role:${options.role} in ${ranking}`)

    // Determine the name, and optionally the role+guild.
    let name: string
    let role_id: string | undefined
    let guild_id: string | undefined
    if (options.role) {
      const role = await app.discord.getRole(options.role.guild_id, options.role.id)
      name = role.name
      role_id = role.id
      guild_id = options.role.guild_id
    } else if (options.name) {
      name = options.name
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
 * Updates the players' ratings
 *
 * Also updates:
 * - their role connections
 * - the ranking leaderboard messages
 * - their rank roles in guild rankings
 */
export async function updatePlayerRatings(
  app: App,
  ranking: Ranking,
  update: { player: PartialPlayer; rating: Rating }[],
) {
  sentry.debug(`updatePlayerRatings, ${update.map(u => u.player.data.id)}`)

  const all_players = await app.db.players.fetchMany({
    player_ids: update.map(u => u.player.data.id),
  })

  // Update, with full player object
  const update_players = update.map(({ player, rating }) => ({
    player: all_players.find(p => p.data.id === player.data.id)!,
    rating,
  }))

  await Promise.all([
    await app.db.players.updateRatings(update),
    Promise.all(
      update_players.map(async ({ player, rating }) => {
        // For each player to update, update role connections

        if (app.config.features.RatingRoleConnections) {
          // Update role connections if player associated with a user
          if (player.data.user_id) {
            const access_token = await getUserAccessToken(app, player.data.user_id, [
              D.OAuth2Scopes.RoleConnectionsWrite,
            ])
            if (access_token) {
              await updateUserRoleConnectionData(app, access_token, player)
            }
          }
        }
      }),
    ),
  ])

  // update ranking leaderboards
  await syncRankingLbMessages(app, ranking)

  // update rank roles

  const guild_rankings = await app.db.guild_rankings.fetch({ ranking_id: ranking.data.id })

  await Promise.all(
    guild_rankings.map(async ({ guild, guild_ranking }) => {
      await Promise.all(
        all_players.map(async player => {
          await updateRankRolesForPlayer(app, player, guild_ranking)
        }),
      )
    }),
  )
}

export async function setPlayerDisabled(app: App, player: Player, disabled: boolean) {
  sentry.debug(
    `setPlayerDisabled ${disabled} ${player.data.flags}, ${player.data.flags | PlayerFlags.Disabled}, ${player.data.flags & ~PlayerFlags.Disabled}`,
  )
  await player.update({
    flags: disabled ? player.data.flags | PlayerFlags.Disabled : player.data.flags & ~PlayerFlags.Disabled,
  })

  await syncRankingLbMessages(app, await player.ranking())
}

/**
 * If the player is associated with a user or role, update their name in the database.
 */
export async function refreshPlayerName(app: App, player: Player) {
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
