import { DbClient } from '../database/client'
import { getNeonDrizzleWsClient } from '../database/drizzle-client'
import { Env } from '../Env'
import { sentry } from '../logging/sentry'
import { App } from './context/app'
import all_event_listeners from './services/all-event-listeners'
import all_views from './services/all-views'

export default (env: Env): App => {
  const db = getNeonDrizzleWsClient(env.POSTGRES_URL, env.POSTGRES_READ_URL, sentry)
  const db_client = new DbClient(db)

  return new App(env, all_views, all_event_listeners, { db: db_client })
}
