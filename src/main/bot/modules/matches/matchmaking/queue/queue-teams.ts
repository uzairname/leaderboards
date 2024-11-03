import * as D from 'discord-api-types/v10'
import { PartialRanking } from '../../../../../../database/models/rankings'
import { sentry } from '../../../../../../logging/sentry'
import { App } from '../../../../../app/App'
import { UserError } from '../../../../errors/UserError'
import { getRegisterPlayer } from '../../../players/manage-players'
import { ensureNoActiveMatches, ensurePlayersEnabled } from '../../management/match-creation'

/**
 * When a user uses a command or button to join a global queue for a ranking.
 * User's team joins the queue. Or a new team with the user joins.
 */
export async function userJoinQueue(
  app: App,
  p_ranking: PartialRanking,
  user: D.APIUser,
): Promise<{
  rejoined: boolean
}> {
  const ranking = await p_ranking.fetch()
  sentry.debug(`userJoinQueue: ${user.id} in ${ranking}`)

  if (!ranking.data.matchmaking_settings.queue_enabled) {
    throw new UserError(`The queue is not enabled for ${ranking.data.name}`)
  }
  const player = await getRegisterPlayer(app, user, ranking)

  await ensureNoActiveMatches(app, [player], ranking)
  await ensurePlayersEnabled(app, [player], ranking)

  // Get all teams the player is in
  const player_teams = await player.teams()
  sentry.debug(`got ${player}'s teams: ${player_teams[0]?.team}`)

  if (player_teams.length == 0) {
    sentry.debug(`player ${player} is not in a team`)
    // the player is not in a team. create a new team with the player and add it to the queue
    const new_team = await app.db.teams.create(ranking, {}, [player])
    await new_team.addToQueue()
    return { rejoined: false }
  } else if (player_teams.every(team => !team.in_queue)) {
    sentry.debug(`player ${player} is in a team, but it's not in the queue`)
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
    sentry.debug(`player ${player} is in a team, and it's already in the queue`)
    // The player is in one team, and it's in the queue. Reqoin.
    await player_teams[0].team.addToQueue()
    return { rejoined: true }
  } else {
    sentry.debug(`player ${player} is in multiple teams, some of which are in the queue`)
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
  ranking: PartialRanking,
  user: D.APIUser,
): Promise<number | undefined> {
  sentry.debug(`playerLeaveQueue: ${user.id} in ${ranking}`)
  return (await app.db.players.fetchByUserRanking(user.id, ranking))?.removeTeamsFromQueue()
}
