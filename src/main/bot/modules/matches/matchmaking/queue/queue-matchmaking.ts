import { Ranking } from '../../../../../../database/models'
import { sentry } from '../../../../../../logging/sentry'
import { App } from '../../../../../app/App'
import { start1v1SeriesThread } from '../../management/match-creation'

export async function findMatchFromQueue(app: App, ranking: Ranking, guild_id: string) {
  sentry.debug(`findMatchFromQueue: ${ranking.data.name} in ${guild_id}`)

  // Find all teams in the queue
  const num_teams = ranking.data.num_teams

  // Remove the teams from the queue
  const queue_teams = await ranking.popTeamsFromQueue(num_teams)
  if (!queue_teams) return

  try {
    // Create the match
    sentry.debug(`Trying to create match for ${queue_teams.length} teams`)

    const guild_ranking = await app.db.guild_rankings.get({
      guild_id,
      ranking_id: ranking.data.id,
    })

    const match = await start1v1SeriesThread(
      app,
      guild_ranking,
      queue_teams.map(team => team.players),
    )

    return match
  } catch (error) {
    sentry.debug(`Error finding match from queue: ${error}`)
    // Add the teams back to the queue
    await ranking.addTeamsToQueue(queue_teams.map(team => team.id))
    return
  }
}
