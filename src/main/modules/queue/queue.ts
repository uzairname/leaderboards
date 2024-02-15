import * as D from 'discord-api-types/v10'
import { App } from '../../app/app'
import { getRegisterPlayer } from '../players'

/**
 * When a user uses a command or button to join a global queue for a ranking.
 * User's team joins the queue. Or a new team with the user joins.
 */
export async function userJoinQueue(
  app: App,
  ranking_id: number,
  user: D.APIUser,
): Promise<{
  rejoined: boolean
}> {
  const ranking = await app.db.rankings.get(ranking_id)
  const player = await getRegisterPlayer(app, user, ranking)
  const player_queue_teams = await player.teams()

  if (player_queue_teams.length == 0) {
    // the player is not in a team. create a new team with the player and add it to the queue
    ;(await app.db.teams.create(ranking, {}, [player])).addToQueue()
    return { rejoined: false }
  } else if (player_queue_teams.every(team => !team.in_queue)) {
    // the player is in at least one team, but none are in the queue.
    if (player_queue_teams.length == 1) {
      // the player is in a team. add the team to the queue
      player_queue_teams[0].team.addToQueue()
      return { rejoined: false }
    } else {
      // the player is in multiple teams. prompt them to choose a team to join the queue with
      throw new Error('Player is in multiple teams')
    }
  } else if (player_queue_teams.length == 1) {
    // the player is in one team. add the team to the queue
    await player_queue_teams[0].team.addToQueue()
    return { rejoined: true }
  } else {
    // the player is in multiple teams in the queue. prompt them to choose a team to join the queue with
    throw new Error('Player is in multiple teams in the queue')
  }
}

/**
 * When a user uses a command or button to leave queue.
 * Returns the number of teams removed from the queue.
 */
export async function userLeaveQueue(
  app: App,
  ranking_id: number,
  user: D.APIUser,
): Promise<number | undefined> {
  return (await app.db.players.get(user.id, ranking_id))?.removeTeamsFromQueue()
}

