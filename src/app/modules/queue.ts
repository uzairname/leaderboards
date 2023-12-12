import { APIUser } from 'discord-api-types/v10'

import { App } from '../app'

import { getRegisterPlayer } from './players'
import { type Team } from '../../database/models'

/**
 * When a user uses a command or button to join queue.
 * User's team joins the queue. Or a new team with the user joins.
 */
export async function onJoinQueue(
  app: App,
  ranking_id: number,
  user: APIUser,
): Promise<{
  rejoined: boolean
}> {
  const ranking = await app.db.rankings.get(ranking_id)

  const player = await getRegisterPlayer(app, user, ranking)

  const player_queue_teams = await player.queueTeams()

  if (player_queue_teams.length == 0) {
    // the player is not in a team in the queue.

    // check if the player is part of a team
    const player_teams = await player.teams()
    var team_to_join: Team
    if (player_teams.length == 0) {
      // the player is not in a team. create a new team with the player
      team_to_join = await app.db.teams.create(ranking, {}, [player])
    } else if (player_teams.length == 1) {
      // the player is in a team. add the team to the queue
      team_to_join = player_teams[0]
    } else {
      // the player is in multiple teams. prompt them to choose a team to join the queue with
      throw new Error('Player is in multiple teams')
    }
    await team_to_join.addToQueue()
    return { rejoined: false }
  } else if (player_queue_teams.length == 1) {
    // the player is already in a team in the queue
    await player_queue_teams[0].addToQueue()
    return { rejoined: true }
  } else {
    // the player is in multiple teams in the queue. prompt them to choose a team to join the queue with
    throw new Error('Player is in multiple teams in the queue')
  }
}

/**
 * When a user uses a command or button to leave queue.
 */
export async function onLeaveQueue(app: App, ranking_id: number, user: APIUser) {
  // find the team the user is in in the ranking's queue
}
