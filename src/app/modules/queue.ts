import { APIUser } from 'discord-api-types/v10'

import { App } from '../app'
import { Errors } from '../messages/errors'

import { RankingDivision, Player, Ranking } from '../../database/models'

/**
 * When a user uses a command or button to join queue.
 */
export async function onJoinQueue(app: App, division_id: number, user: APIUser) {
  // check if the user is already in a queue. if so, return

  // solo queue: create a new team with the user in it.

}

/**
 * When a user uses a command or button to leave queue.
 */
export async function onLeaveQueue(app: App, division_id: number, user: APIUser) {
  // remove the user's team from the queue
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
