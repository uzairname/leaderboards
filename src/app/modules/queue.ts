import { APIUser } from 'discord-api-types/v10'

import { App } from '../app'
import { Errors } from '../errors/errors'

import { RankingDivision, Player, Ranking } from '../../database/models'

/**
 * When a user uses a command or button to join queue.
 * User's team joins the queue. Or a new team with the user joins.
 */

export async function onJoinQueue(app: App, lb_division_id: number, user: APIUser) {
  // add the player or their team to the queue.
  // if the player is already in a team in the queue, return.
  // make sure that the size of the team is appropriate for the leaderboard.
  // check if the team is already in the queue.
}

/**
 * When a user uses a command or button to leave queue.
 */
export async function onLeaveQueue(app: App, division_id: number, user: APIUser) {
  // find the team the user is in in the division's queue
}

/**
 *
 */
async function findMatchFromQueue(ranking: Ranking): Promise<Array<Array<Player>>> {
  /*
  When a match is created, all queue users are removed from all other queue teams they're in.
  */
  throw new Errors.NotImplimented()
}
