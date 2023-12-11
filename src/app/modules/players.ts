import { APIUser } from 'discord-api-types/v10'
import { DbClient } from '../../database/client'
import { Player, Ranking } from '../../database/models'

export async function getRegisterPlayer(
  client: DbClient,
  discord_user: APIUser,
  ranking: Ranking,
): Promise<Player> {
  // Gets a player in the leaderboard, with the user's id

  let player = await client.players.get(discord_user.id, ranking.data.id)

  if (!player) {
    const INITIAL_RATING = 0

    const app_user = await client.users.getOrCreate({
      id: discord_user.id,
      name: discord_user.username,
    })

    player = await client.players.create(app_user, ranking, {
      time_created: new Date(),
      rating: INITIAL_RATING,
    })
  }

  return player
}

async function add_points_to_player(user: APIUser, leaderboard_id: number, points: number) {}
