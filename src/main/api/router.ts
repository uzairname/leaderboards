import { desc, eq } from 'drizzle-orm'
import { Router } from 'itty-router'
import { Player } from '../../database/models'
import { Players } from '../../database/schema'
import { sentry } from '../../request/sentry'
import { App } from '../app/app'

export const apiRouter = (app: App) =>
  Router({ base: '/api' })
    .get('/', async () => {
      await main(app)
      return new Response('API')
    })
    .all('*', request => {
      return new Response('Not found', { status: 404 })
    })

async function main(app: App) {
  // const ranking = await app.db.rankings.get(5)
  // sentry.debug('got ranking')

  // sentry.debug('getting players')

  // const players = await app.db.db
  //     .select()
  //     .from(Players)
  //     .where(eq(Players.ranking_id, 5))
  //     .orderBy(desc(Players.rating))

  //   sentry.debug(`players   ${players}`)
  // const cplayers = players.map(item => {
  //   return new Player(item, app.db)
  // })

  // sentry.debug(`cplayers   ${cplayers}`)

  const ranking = await app.db.rankings.get(5)

  const rankingplayers = await ranking.getOrderedTopPlayers()

  sentry.debug(`rankingplayers   ${rankingplayers.length}`)

  // sentry.debug(players)
}
