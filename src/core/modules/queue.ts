import { APIUser } from 'discord-api-types/v10'
import { assertNonNullable } from '../../utils/utils'
import { DbClient } from '../../database/client'

import { App } from '../app'
import { AppError, AppErrors, Errors } from '../errors'

import { getRegisterPlayer } from './players'
import { getLeaderboardById } from './leaderboards'
import { LeaderboardDivision, Player, QueueTeam } from '../../database/models'

export async function onJoinQueue(app: App, lb_division_id: number, user: APIUser) {
  /*
    When a user joins the queue, their team joins with them.
    If the team is in another queue already, a duplicate team joins the queue.
    When a match is created, all queue users are removed from all other queue teams they're in.
    */

  // find the queue teams the player is in.
  let player_team = (await app.db.queue_teams.getByUser(user.id))[0]

  const leaderboard = await getLeaderboardById(app.db, lb_division_id)
  const lb_division = await app.db.leaderboard_divisions.getOrFail(lb_division_id)

  if (!player_team) {
    assertNonNullable(leaderboard.data.players_per_team)
    if (leaderboard.data.players_per_team == 1) {
      // Player is not part of a team. Create a new team with the player in it.
      const player = await getRegisterPlayer(app.db, user, lb_division)
      player_team = await formQueueTeam(app.db, [player])
    } else {
      throw new AppErrors.InvalidQueueTeamSize(leaderboard.data.players_per_team)
    }
  }

  // make sure that the size of the team is appropriate for the leaderboard.
  // check if the team is already in the queue.

  if (player_team.data.queued_lb_division_id == lb_division_id) {
    throw new AppError('You are already in the queue for this leaderboard')
  }

  await player_team.update({
    queued_lb_division_id: lb_division_id,
  })
}

export async function onLeaveQueue(app: App, lb_division_id: number, user: APIUser) {
  throw new Errors.NotImplimented()
}

export async function formQueueTeam(
  client: DbClient,
  players: Array<Player>,
  queued_lb_division?: LeaderboardDivision,
): Promise<QueueTeam> {
  return await client.queue_teams.create({
    queued_lb_division_id: queued_lb_division?.data.id,
    user_ids: players.map((player) => player.data.user_id),
  })
}

export async function joinTeam(
  leaderboard_division: LeaderboardDivision,
  player: Player,
  team: QueueTeam,
) {}

export async function leaveQueue(leaderboard_division: LeaderboardDivision, team: Array<Player>) {}
