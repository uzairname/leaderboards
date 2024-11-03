import { PartialGuildRanking } from '../../../../../../database/models/guildrankings'
import { sentry } from '../../../../../../logging/sentry'
import { App } from '../../../../../app/App'
import { start1v1SeriesThread } from '../../ongoing-math-thread/manage-ongoing-match'

export async function findMatchFromQueue(app: App, gr: PartialGuildRanking) {
  const { ranking, guild_ranking } = await gr.fetch()

  sentry.debug(`findMatchFromQueue: ${ranking} in ${guild_ranking}`)

  const queue_teams = await ranking.popTeamsFromQueue(ranking.data.teams_per_match)
  if (!queue_teams) return

  sentry.debug(`Creating a match thread for ${queue_teams.length} teams`)

  await start1v1SeriesThread(
    app,
    guild_ranking,
    queue_teams.map(team => team.players),
  )
}
