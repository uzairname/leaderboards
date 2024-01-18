import { Router } from 'itty-router'
import { sentry } from '../../request/sentry'
import { App } from '../app/app'
import { getRegisterPlayer } from '../modules/players'
import { leaderboardMessage } from '../modules/rankings/ranking_channels'

export const apiRouter = (app: App) =>
  Router({ base: '/api' })
    .get('/', async () => {
      const result = await main(app)
      return new Response(result)
    })
    .all('*', () => new Response('Not found', { status: 404 }))

async function main(app: App) {
  const ranking = app.db.rankings.partial(17)

  let player = await getRegisterPlayer(app, '1108557678013325385', ranking)

  const rankingplayers = await ranking.getOrderedTopPlayers()
  sentry.debug(`rankingplayers ${rankingplayers.length}`)
  return (await leaderboardMessage(ranking)).patchdata.embeds![0].description
}
