import * as D from 'discord-api-types/v10'
import { sentry } from '../../../../../../logging/sentry'
import { App } from '../../../../../app/App'
import { getOrCreatePlayer } from '../../../players/manage-players'
import { UserError } from '../../../../errors/UserError'

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
  sentry.debug(`userJoinQueue: ${user.id} in ${ranking_id}`)

  const ranking = await app.db.rankings.get(ranking_id)
  if (!ranking.data.matchmaking_settings.queue_enabled) {
    throw new UserError(`The queue is not enabled for ${ranking.data.name}`)
  }
  const player = await getOrCreatePlayer(app, user, ranking_id)

  // Get all teams the player is in
  const player_teams = await player.teams()

  if (player_teams.length == 0) {
    // the player is not in a team. create a new team with the player and add it to the queue
    const new_team = await app.db.teams.create(ranking, {}, [player])
    await new_team.addToQueue()
    return { rejoined: false }
  } else if (player_teams.every(team => !team.in_queue)) {
    // The player is in at least one team, but none are in the queue.
    if (player_teams.length == 1) {
      // The player is in a team. Add the team to the queue
      player_teams[0].team.addToQueue()
      return { rejoined: false }
    } else {
      // The player is in multiple teams. Decide which one to join the queue with
      throw new Error('Player is in multiple teams')
    }
  } else if (player_teams.length == 1) {
    // The player is in one team, and it's in the queue. Reqoin.
    await player_teams[0].team.addToQueue()
    return { rejoined: true }
  } else {
    // The player is in multiple teams, some of which are in the queue.
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
  user_id: string,
): Promise<number | undefined> {
  return (await app.db.players.get(user_id, ranking_id))?.removeTeamsFromQueue()
}

export async function userLeaveAllQueues(app: App, user_id: string): Promise<number> {
  return await app.db.users.removeFromQueues(user_id)
}
