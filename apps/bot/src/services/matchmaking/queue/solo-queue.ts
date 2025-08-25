import { Match, PartialGuildRanking, PartialPlayer, PartialRanking, Player, Ranking } from '@repo/db/models'
import { unflatten } from '@repo/utils'
import { UserError } from '../../../errors/user-errors'
import { App, offload } from '../../../setup/app'

// for team size 1 rankings

/**
 * A user joins the queue through a command or component.
 * Adds the player to the queue and resets the timer. Checks to start a new match in a thread.
 * Sends a followup reply after joining.
 */
export async function userJoinQueue(
  app: App,
  user_id: string,
  guild_id: string,
  p_ranking: PartialRanking,
): Promise<{ already_in: boolean }> {
  const { guild_ranking, ranking } = await app.db.guild_rankings.fetch({
    ranking_id: p_ranking.data.id,
    guild_id,
  })
  if (!ranking.data.matchmaking_settings?.queue_enabled) {
    throw new UserError(`The queue is not enabled for ${ranking.data.name}`)
  }

  const player = await app.players.getOrCreatePlayerByUser(app, user_id, ranking)

  await app.matches.ensurePlayersCanStartMatch(app, [player])

  const already_in = await isInQueue(app, player, ranking)

  await addPlayerToQueue(player)

  offload(
    app,
    async app => {
      await findMatchFromQueue(app, guild_ranking)
    },
    'after-join-queue',
  )

  return { already_in }
}

export async function findMatchFromQueue(app: App, gr: PartialGuildRanking): Promise<Match | undefined> {
  const { ranking, guild_ranking } = await gr.fetch()
  if (!ranking.data.matchmaking_settings?.queue_enabled) {
    throw new UserError(`The queue is not enabled for ${ranking.data.name}`)
  }

  const players_in_q = await getPlayersInQueue(app, ranking)

  app.logger.debug(`findMatchFromQueue: Found ${players_in_q.length} players in queue for ${ranking}`)

  if (players_in_q.length < ranking.data.teams_per_match * ranking.data.players_per_team) {
    return
  }

  // Enough players for a match have been found. Choose the subset.
  const players_for_match = players_in_q.slice(0, ranking.data.teams_per_match * ranking.data.players_per_team)

  // remove them from the queue
  await removePlayersFromQueue(app, players_for_match)

  // Start the match
  const team_players = unflatten(players_for_match, ranking.data.players_per_team, true)
  const { match } = await app.matches.ongoing.startWithThread(app, guild_ranking, team_players)

  return match
}

export async function getPlayersInQueue(app: App, ranking: Ranking): Promise<Player[]> {
  const players = await app.db.players.fetchMany({ ranking_id: ranking.data.id })
  const queue_join_timeout_ms =
    app.rankings.getProperties(ranking).matchmaking_settings.queue_join_timeout_minutes * 60 * 1000

  // filter by players who joined recently
  return players.filter(
    p => p.data.time_joined_queue && p.data.time_joined_queue.getTime() > Date.now() - queue_join_timeout_ms,
  )
}

export async function isInQueue(app: App, player: Player, ranking: Ranking): Promise<boolean> {
  const queue_join_timeout_ms =
    app.rankings.getProperties(ranking).matchmaking_settings.queue_join_timeout_minutes * 60 * 1000

  return (
    null !== player.data.time_joined_queue &&
    player.data.time_joined_queue.getTime() > Date.now() - queue_join_timeout_ms
  )
}

export async function addPlayerToQueue(player: PartialPlayer) {
  await player.update({ time_joined_queue: new Date(Date.now()) })
}

export async function removePlayersFromQueue(app: App, players: PartialPlayer[]): Promise<void> {
  await app.db.players.setMany(
    players.map(p => p.data.id),
    { time_joined_queue: null },
  )
}
