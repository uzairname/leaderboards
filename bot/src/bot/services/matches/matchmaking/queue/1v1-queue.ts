import { Match, Player } from 'database/models'
import { PartialGuildRanking } from 'database/models/guildrankings'
import { PartialPlayer } from 'database/models/players'
import { PartialRanking } from 'database/models/rankings'
import { AnyDeferContext } from 'discord-framework'
import { checkGuildInteraction } from 'discord-framework/interactions/utils/interaction-checks'
import { sentry } from '../../../../../logging/sentry'
import { nonNullable, unflatten } from 'utils'
import { App } from '../../../../setup/app'
import { UserError } from '../../../../errors/UserError'
import { getRegisterPlayer } from '../../../players/manage-players'
import { ensureNoActiveMatches, ensurePlayersEnabled } from '../../management/match-creation'
import { start1v1SeriesThread } from '../../ongoing-math-thread/manage-ongoing-match'

// for team size 1 rankings

/**
 * A user joins the queue through a command or component.
 * Adds the player to the queue and resets the timer. Checks to start a new match in a thread.
 * Sends a followup reply after joining.
 */
export async function userJoinQueue(
  app: App,
  ctx: AnyDeferContext,
  ranking_: PartialRanking,
): Promise<{ already_in: boolean; match?: Match; expires_at: Date }> {
  const { guild_ranking, ranking } = await app.db.guild_rankings.fetch({
    ranking_id: ranking_.data.id,
    guild_id: checkGuildInteraction(ctx.interaction).guild_id,
  })
  if (!ranking.data.matchmaking_settings.queue_enabled) {
    throw new UserError(`The queue is not enabled for ${ranking.data.name}`)
  }

  const user = checkGuildInteraction(ctx.interaction).member.user.id
  const player = await getRegisterPlayer(app, user, ranking)

  await ensureNoActiveMatches(app, [player])
  await ensurePlayersEnabled(app, [player])

  let already_in = false
  if (await isInQueue(app, player)) {
    already_in = true
  }
  const expires_at = await addPlayerToQueue(app, player)

  const match = await findMatchFromQueue(app, guild_ranking, ctx)

  return { already_in, match, expires_at }
}

export async function findMatchFromQueue(
  app: App,
  gr: PartialGuildRanking,
  ctx?: AnyDeferContext,
): Promise<Match | undefined> {
  const { ranking, guild_ranking } = await gr.fetch()
  if (!ranking.data.matchmaking_settings.queue_enabled) {
    throw new UserError(`The queue is not enabled for ${ranking.data.name}`)
  }

  const players_in_q = await getPlayersInQueue(app, ranking)

  sentry.debug(
    `findMatchFromQueue: Found ${players_in_q.length} players in queue for ${ranking.data}`,
  )

  if (players_in_q.length < ranking.data.teams_per_match * ranking.data.players_per_team) {
    return
  }

  // Enough players for a match have been found. Choose the subset.
  const players_for_match = players_in_q.slice(
    0,
    ranking.data.teams_per_match * ranking.data.players_per_team,
  )

  // remove them from the queue
  await removePlayersFromQueue(app, players_for_match)

  // Start the match
  const team_players = unflatten(players_for_match, ranking.data.players_per_team, true)
  const { match } = await start1v1SeriesThread(app, guild_ranking, team_players)

  return match
}

export async function getPlayersInQueue(app: App, ranking: PartialRanking): Promise<Player[]> {
  const players = await app.db.players.fetchMany({ ranking_id: ranking.data.id })

  // filter by players who joined recently
  return players.filter(
    p =>
      p.data.time_joined_queue &&
      p.data.time_joined_queue.getTime() > Date.now() - app.config.QueueJoinTimeoutMs,
  )
}

export async function isInQueue(app: App, p: PartialPlayer): Promise<boolean> {
  const player = await p.fetch()
  return (
    player.data.time_joined_queue !== null &&
    player.data.time_joined_queue.getTime() > Date.now() - app.config.QueueJoinTimeoutMs
  )
}

/**
 * @returns The time the player will be removed from the queue
 */
export async function addPlayerToQueue(app: App, p: PartialPlayer): Promise<Date> {
  const player = await p.update({ time_joined_queue: new Date(Date.now()) })
  return new Date(
    nonNullable(player.data.time_joined_queue, 'time_joined_queue').getTime() +
      app.config.QueueJoinTimeoutMs,
  )
}

export async function removePlayersFromQueue(app: App, players: PartialPlayer[]): Promise<void> {
  await app.db.players.updateMany(
    players.map(p => p.data.id),
    { time_joined_queue: null },
  )
}
