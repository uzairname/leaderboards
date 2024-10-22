import * as D from 'discord-api-types/v10'
import { nonNullable } from '../../../../utils/utils'
import { getUserAccessToken } from '../../../api/oauth'
import { App } from '../../../context/app_context'
import { Player, Ranking } from '../../../database/models'
import { updateUserRoleConnectionData } from '../linked_roles'

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
      typeof discord_user == 'string' ? await app.bot.getUser(discord_user) : discord_user

    const app_user = await app.db.users.getOrCreate({
      id: discord_user.id,
      name: discord_user.global_name ?? discord_user.username,
    })

    ranking = typeof ranking == 'number' ? await app.db.rankings.get(ranking) : ranking

    player = await app.db.players.create(app_user, ranking, {
      name: discord_user.global_name ?? discord_user.username,
      rating: nonNullable(ranking.data.elo_settings?.initial_rating, 'initial_rating'),
      rd: nonNullable(ranking.data.elo_settings?.initial_rd, 'initial_rd'),
    })
  }

  return player
}

export async function updatePlayerRating(app: App, player: Player, rating: number, rd: number) {
  await player.update({ rating, rd })

  await Promise.all([
    getUserAccessToken(app, player.data.user_id, [D.OAuth2Scopes.RoleConnectionsWrite]).then(
      async access_token => {
        if (access_token) {
          await updateUserRoleConnectionData(
            app,
            access_token,
            rating,
            (await player.ranking).data.name ?? 'Unnamed Ranking',
          )
        }
      },
    ),
  ])
}
