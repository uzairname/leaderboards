import * as D from 'discord-api-types/v10'
import { Player, Ranking } from '../../../../database/models'
import { PlayerFlags } from '../../../../database/models/players'
import { nonNullable } from '../../../../utils/utils'
import { getUserAccessToken } from '../../../api/oauth-router'
import { App } from '../../../app/App'
import { syncRankingLbMessages } from '../leaderboard/leaderboard-message'
import { updateUserRoleConnectionData } from '../linked-roles/role-connections'
import { calcDisplayRating } from './display'

export async function getOrCreatePlayer(
  app: App,
  discord_user: D.APIUser | string,
  ranking: Ranking | number,
): Promise<Player> {
  // Gets a player in the leaderboard, with the user's id

  let player = await app.db.players.get(
    typeof discord_user == 'string' ? discord_user : discord_user.id,
    typeof ranking == 'number' ? ranking : ranking.data.id,
  )

  if (!player) {
    discord_user =
      typeof discord_user == 'string' ? await app.discord.getUser(discord_user) : discord_user

    const app_user = await app.db.users.getOrCreate({
      id: discord_user.id,
      name: discord_user.global_name ?? discord_user.username,
    })

    ranking = typeof ranking == 'number' ? await app.db.rankings.get(ranking) : ranking

    player = await app.db.players.create(app_user, ranking, {
      name: discord_user.global_name ?? discord_user.username,
      rating: nonNullable(ranking.data.elo_settings?.prior_mu, 'initial_rating'),
      rd: nonNullable(ranking.data.elo_settings?.prior_rd, 'initial_rd'),
    })
  }

  return player
}

export async function updatePlayerRating(app: App, player: Player, rating: number, rd: number) {
  await player.update({ rating, rd })
  const ranking = await player.ranking

  if (app.config.features.RoleConnectionsElo) {
    const display_rating = calcDisplayRating(app, ranking.data.elo_settings)(player.data)
    const access_token = await getUserAccessToken(app, player.data.user_id, [
      D.OAuth2Scopes.RoleConnectionsWrite,
    ])
    if (access_token) {
      await updateUserRoleConnectionData(
        app,
        access_token,
        display_rating.score,
        ranking.data.name,
      )
    }
  }
}

export async function updatePlayerRatings(
  app: App,
  to_update: { [id: number]: { rating: number; rd: number } },
) {
  const ranking_ids = new Set<number>()
  Object.entries(to_update).forEach(async ([id, { rating, rd }]) => {
    const player = await app.db.players.getById(parseInt(id))
    await updatePlayerRating(app, player, rating, rd)
    ranking_ids.add(player.data.ranking_id)
  })

  ranking_ids.forEach(async ranking_id => {
    const ranking = await app.db.rankings.get(ranking_id)
    await syncRankingLbMessages(app, ranking)
  })
}

export async function setUserDisabled(app: App, player: Player, disabled: boolean) {
  await player.update({
    flags: disabled
      ? player.data.flags | PlayerFlags.Disabled
      : player.data.flags & ~PlayerFlags.Disabled,
  })

  const ranking = await player.ranking
  await syncRankingLbMessages(app, ranking)
}
