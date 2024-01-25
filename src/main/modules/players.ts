import * as D from 'discord-api-types/v10'
import { Player, Ranking } from '../../database/models'
import { nonNullable } from '../../utils/utils'
import { App } from '../app/app'

export async function getRegisterPlayer(
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
