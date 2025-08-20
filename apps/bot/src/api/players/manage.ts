import { PartialPlayer, PartialRanking, Player, PlayerFlags, Ranking, Rating, UserPlayer } from '@repo/db/models'
import { AnyDeferredContext, GuildInteraction } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { UserError } from '../../errors/user-errors'
import { getUserAccessToken } from '../../routers/oauth'
import { App } from '../../setup/app'
import { syncRankingLbMessages } from '../leaderboard/manage'
import { rescoreAllMatches } from '../matches/scoring/score-matches'
import { updateUserRoleConnectionData } from '../role-connections/role-connections'
import { assignRankRolesForUser } from './rank-roles'
import { GuildAuth, ensureGuildAdminPerms } from '../perms'

/**
 * Gets a player by user and ranking, or registers a new player associated with the user in that ranking.
 */
export async function getOrCreatePlayerByUser(
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

export async function getOrCreatePlayerByRole({
  app,
  auth,
  p_ranking,
  role,
}: {
  app: App
  auth: GuildAuth
  p_ranking: PartialRanking
  role: {
    id: string
    guild_id: string
  }
}) {
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
export async function getOrCreatePlayer({
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
  if (user) return getOrCreatePlayerByUser(app, user, ranking)
  else if (role) return getOrCreatePlayerByRole({ app, auth, p_ranking: ranking, role })
  else throw new Error('Either user or role must be provided to getOrCreatePlayer')
}

/**
 * Updates the players' ratings in the database
 *
 * Also updates:
 * - their role connections
 * - the ranking leaderboard messages
 * - their rank roles in guild rankings
 */
export async function updatePlayerRatings(
  app: App,
  auth: GuildAuth | 'rescored matches',
  ranking: Ranking,
  update_data: { player: PartialPlayer; rating: Rating }[],
  ctx?: AnyDeferredContext,
) {
  auth !== 'rescored matches' && (await ensureGuildAdminPerms(app, auth))

  app.logger.debug(`updatePlayerRatings for ${update_data.length} players in ${ranking}`)

  await app.db.players.updateRatings(update_data)

  // Fetch all players again to get the updated data
  const all_players = await app.db.players.fetchMany({
    player_ids: update_data.map(u => u.player.data.id),
  })

  await Promise.all([
    Promise.all(
      all_players.map(async player => {
        // For each player to update, update role connections

        if (app.config.features.RoleConnections) {
          // Update role connections if player associated with a user
          if (player.data.user_id) {
            app.logger.debug(`Updating role connections for ${player.data.user_id}`)
            const access_token = await getUserAccessToken(app, player.data.user_id, [
              D.OAuth2Scopes.RoleConnectionsWrite,
            ])

            if (access_token) {
              app.logger.debug(`Found access token for ${player.data.user_id}. Updating role connections.`)
              await updateUserRoleConnectionData(app, access_token, player)
            }
          }
        }
      }),
    ),
  ])

  // update ranking leaderboards
  await syncRankingLbMessages(app, ranking)

  // assign rank roles if there are less than 10 players to update

  if (all_players.length >= 10) {
    app.logger.debug(`Skipping rank role assignment for ${all_players.length} players (too many)`)
  } else {
    const guild_rankings = await app.db.guild_rankings.fetch({ ranking_id: ranking.data.id })

    await Promise.all(
      guild_rankings.map(async ({ guild_ranking }) => {
        await Promise.all(
          all_players.map(async player => {
            const user = await player.user()
            if (!user) return // player is not associated with a Discord user
            await assignRankRolesForUser(app, user, guild_ranking)
          }),
        )
      }),
    )
  }
}

export async function setPlayerDisabled(app: App, auth: GuildAuth, player: Player, disabled: boolean) {
  await ensureGuildAdminPerms(app, auth)

  app.logger.debug(
    `setPlayerDisabled ${disabled} ${player.data.flags}, ${player.data.flags | PlayerFlags.Disabled}, ${player.data.flags & ~PlayerFlags.Disabled}`,
  )
  await player.update({
    flags: disabled ? player.data.flags | PlayerFlags.Disabled : player.data.flags & ~PlayerFlags.Disabled,
  })

  await rescoreAllMatches(app, await player.ranking())
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

export async function deletePlayer(app: App, player: Player, auth: GuildInteraction): Promise<void> {
  await ensureGuildAdminPerms(app, auth)
  await player.delete()
  const ranking = await player.ranking()
  await syncRankingLbMessages(app, ranking)
}
