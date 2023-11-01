import { APIUser } from 'discord-api-types/v10'
import { assertNonNullable } from '../../utils/utils'
import { DbClient } from '../../database/client'

import { App } from '../app'
import { AppError, AppErrors, Errors } from '../errors'

import { getRegisterPlayer } from './players'
import { RankingDivision, Player, QueueTeam } from '../../database/models'

/**
 * When a user uses a command or button to join queue.
 * User's team joins the queue. Or a new team with the user joins.
 */
export async function onJoinQueue(
  app: App,
  lb_division_id: number,
  user: APIUser,
): Promise<{
  rejoined: boolean
}> {
  const lb_division = await app.db.ranking_divisions.getOrFail(lb_division_id)

  // find the queue teams the player is in.
  let player_team = (await app.db.queue_teams.getByUser(user.id))[0]

  if (!player_team) {
    const player = await getRegisterPlayer(app.db, user, lb_division)
    player_team = await app.db.queue_teams.create({
      user_ids: [player.data.user_id],
    })
  }

  // make sure that the size of the team is appropriate for the leaderboard.
  // check if the team is already in the queue.

  if (player_team.data.queued_ranking_division_id == lb_division_id) {
    return { rejoined: true }
  } else {
    await player_team.update({
      queued_ranking_division_id: lb_division_id,
    })
    return { rejoined: false }
  }
}

/**
 * When a user uses a command or button to leave queue.
 */
export async function onLeaveQueue(app: App, division_id: number, user: APIUser) {
  // find the team the user is in in the division's queue
  const team = await app.db.queue_teams.getByUserAndDivision(user.id, division_id)
}

export async function joinTeam(
  leaderboard_division: RankingDivision,
  player: Player,
  team: QueueTeam,
) {}

export async function leaveQueue(leaderboard_division: RankingDivision, team: Array<Player>) {}
