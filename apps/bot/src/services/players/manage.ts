import { PartialPlayer, PartialRanking, Player, PlayerFlags, Rating } from '@repo/db/models'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../logging/sentry'
import { getUserAccessToken } from '../../routers/oauth'
import { App } from '../../setup/app'
import { syncRankingLbMessages } from '../leaderboard/manage'
import { updateUserRoleConnectionData } from '../role-connections/role-connections'

/**
 * Gets a player by user and ranking, or registers a new player in that ranking.
 */
export async function getOrCreatePlayer(
  app: App,
  partial_discord_user: D.APIUser | string,
  p_ranking: PartialRanking,
): Promise<Player> {
  const discord_user_id = typeof partial_discord_user === 'string' ? partial_discord_user : partial_discord_user.id
  sentry.debug(`getRegisterPlayer: ${discord_user_id} in ${p_ranking}`)

  let player = await app.db.players.fetchBy({ user_id: discord_user_id, ranking: p_ranking })

  if (!player) {
    const ranking = await p_ranking.fetch()
    sentry.debug(`registering ${discord_user_id} in ${ranking}`)

    const discord_user =
      typeof partial_discord_user === 'string' ? await app.discord.getUser(partial_discord_user) : partial_discord_user

    const app_user = await app.db.users.getOrCreate({
      id: discord_user.id,
      name: discord_user.global_name ?? discord_user.username,
    })

    player = await app.db.players.create(app_user, ranking, {
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
 * Updates players in the database.
 *
 * Also updates:
 * - their role connections
 * - the ranking leaderboard messages
 */
export async function updatePlayerRatings(app: App, update: { player: PartialPlayer; rating: Rating }[]) {
  sentry.debug(`updatePlayerRatings, ${update.map(u => u.player.data.id)}`)

  const all_players = await app.db.players.fetchMany({
    player_ids: update.map(u => u.player.data.id),
  })

  // Update, with full player object
  const update_players = update.map(({ player, rating }) => ({
    player: all_players.find(p => p.data.id === player.data.id)!,
    rating,
  }))

  const ranking_ids_affected = new Set(all_players.map(player => player.data.ranking_id))

  await Promise.all([
    await app.db.players.updateRatings(update),
    Promise.all(
      update_players.map(async ({ player, rating }) => {
        // For each player to update, update role connections
        if (app.config.features.RatingRoleConnections) {
          // Update rating roles

          const access_token = await getUserAccessToken(app, player.data.user_id, [D.OAuth2Scopes.RoleConnectionsWrite])
          if (access_token) {
            await updateUserRoleConnectionData(app, access_token, player)
          }
        }
      }),
    ),
  ])

  // update ranking leaderboards
  sentry.debug(`updatePlayers, updating ${ranking_ids_affected.size} leaderboards`)
  await Promise.all(
    Array.from(ranking_ids_affected).map(ranking => syncRankingLbMessages(app, app.db.rankings.get(ranking))),
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

export async function refreshPlayerName(app: App, player: Player) {
  const discord_user = await app.discord.getUser(player.data.user_id)
  const new_name = discord_user.global_name ?? discord_user.username
  await Promise.all([player.update({ name: new_name }), app.db.users.get(discord_user.id).update({ name: new_name })])
}
