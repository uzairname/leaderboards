import { DbClient, getNeonDrizzleWsClient } from '@repo/database'
import { Env } from '../Env'
import { sentry } from '../logging/sentry'
import all_event_listeners from '../services/all-event-listeners'
import all_views from '../services/all-views'
import { App } from './app'
import { DbLoggerWrapper } from './middleware/loggers'

export default (env: Env): App => {
  const logger = new DbLoggerWrapper(sentry)
  const db = getNeonDrizzleWsClient(env.POSTGRES_URL, env.POSTGRES_READ_URL, logger)
  const db_client = new DbClient(db, logger)
  return new App(env, all_views, all_event_listeners, { db: db_client })
}
