import * as D from 'discord-api-types/v10'
import { Player } from '../../../database/models'
import { PartialPlayer, PlayerFlags } from '../../../database/models/players'
import { PartialRanking, Rating } from '../../../database/models/rankings'
import { sentry } from '../../../logging/sentry'
import { App } from '../../context/app'
import { getUserAccessToken } from '../../routers/oauth'
import { syncRankingLbMessages } from '../leaderboard/leaderboard-message'
import { updateUserRoleConnectionData } from '../linked-roles/role-connections'
import { calcDisplayRating } from './display'

/**
 * Gets a player by user and ranking, or registers a new player in that ranking.
 */
export async function getRegisterPlayer(
  app: App,
  partial_discord_user: D.APIUser | string,
  p_ranking: PartialRanking,
): Promise<Player> {
  const discord_user_id =
    typeof partial_discord_user === 'string' ? partial_discord_user : partial_discord_user.id
  sentry.debug(`getRegisterPlayer: ${discord_user_id} in ${p_ranking}`)

  let player = await app.db.players.fetchByUserRanking(discord_user_id, p_ranking)

  if (!player) {
    const ranking = await p_ranking.fetch()
    sentry.debug(`registering ${discord_user_id} in ${ranking}`)

    const discord_user =
      typeof partial_discord_user === 'string'
        ? await app.discord.getUser(partial_discord_user)
        : partial_discord_user

    const app_user = await app.db.users.getOrCreate({
      id: discord_user.id,
      name: discord_user.global_name ?? discord_user.username,
    })

    player = await app.db.players.create(app_user, ranking, {
      name: app_user.data.name,
      rating: {
        mu: ranking.data.initial_rating.mu,
        rd: ranking.data.initial_rating.rd,
        vol: ranking.data.initial_rating.vol,
      },
    })
  }

  return player
}

/**
 * Updates players in the database. Updates their role connections and the ranking leaderboards.
 */
export async function updatePlayerRatings(
  app: App,
  update: { player: PartialPlayer; rating: Rating }[],
) {
  sentry.debug(`updatePlayerRatings, ${update.map(u => u.player.data.id)}`)
  const ranking_ids_affected = new Set<number>()

  await Promise.all([
    // Update player ratings
    app.db.players.updateRatings(update),
    // Update leaderboard and role connections
    Promise.all(
      update.map(async ({ player: p_player, rating }) => {
        // For each player to update, update role connections and leaderboard if rating or name changed
        const player = await p_player.fetch()
        const ranking = await player.ranking()

        // store affected rankings for later leaderboard update
        ranking_ids_affected.add(ranking.data.id)

        if (app.config.features.RatingRoleConnections) {
          // calculate display rating using updated rating or current rating
          const display_rating = calcDisplayRating(app, ranking.data.initial_rating)(rating)

          const access_token = await getUserAccessToken(app, player.data.user_id, [
            D.OAuth2Scopes.RoleConnectionsWrite,
          ])
          if (access_token) {
            await updateUserRoleConnectionData(
              app,
              access_token,
              display_rating.rating,
              ranking.data.name,
            )
          }
        }
      }),
    ),
  ])

  // update ranking leaderboards
  sentry.debug(`updatePlayers, updating ${ranking_ids_affected.size} leaderboards`)
  await Promise.all(
    Array.from(ranking_ids_affected).map(ranking =>
      syncRankingLbMessages(app, app.db.rankings.get(ranking)),
    ),
  )
}

export async function setPlayerDisabled(app: App, player: Player, disabled: boolean) {
  sentry.debug(
    `setPlayerDisabled ${disabled} ${player.data.flags}, ${player.data.flags | PlayerFlags.Disabled}, ${player.data.flags & ~PlayerFlags.Disabled}`,
  )
  await player.update({
    flags: disabled
      ? player.data.flags | PlayerFlags.Disabled
      : player.data.flags & ~PlayerFlags.Disabled,
  })

  await syncRankingLbMessages(app, await player.ranking())
}
