import { DbClient } from 'database/client'
import { CustomLogger, getNeonDrizzleWsClient } from 'database/drizzle-client'
import { Env } from '../Env'
import { sentry } from '../logging/sentry'
import { App } from './setup/app'
import { DbLogger } from './setup/middleware'
import all_event_listeners from './services/all-event-listeners'
import all_views from './services/all-views'

export default (env: Env): App => {
  const logger = new DbLogger(sentry)
  const db = getNeonDrizzleWsClient(env.POSTGRES_URL, env.POSTGRES_READ_URL, logger)
  const db_client = new DbClient(db, logger)
  return new App(env, all_views, all_event_listeners, { db: db_client })
}
