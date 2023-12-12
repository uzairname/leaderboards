import { APIUser } from 'discord-api-types/v10'
import { DbClient } from '../../database/client'
import { Player, Ranking } from '../../database/models'
import { assertValue } from '../../utils/utils'
import { App } from '../app'

export async function getRegisterPlayer(
  app: App,
  discord_user: APIUser | string,
  ranking: Ranking,
): Promise<Player> {
  // Gets a player in the leaderboard, with the user's id

  let player = await app.db.players.get(
    typeof discord_user == 'string' ? discord_user : discord_user.id,
    ranking.data.id,
  )

  if (!player) {
    discord_user =
      typeof discord_user == 'string' ? await app.bot.getUser(discord_user) : discord_user

    const app_user = await app.db.users.getOrCreate({
      id: discord_user.id,
      name: discord_user.username,
    })

    assertValue(ranking.data.elo_settings?.initial_rating, 'initial rating')

    player = await app.db.players.create(app_user, ranking, {
      time_created: new Date(),
      rating: ranking.data.elo_settings?.initial_rating,
    })
  }

  return player
}

async function add_points_to_player(user: APIUser, ranking_id: number, points: number) {}
