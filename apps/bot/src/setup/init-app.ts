import { DbClient, getNeonDrizzleWsClient } from '@repo/db'
import { Env } from '../Env'
import { sentry } from '../logging/sentry'
import all_event_listeners from './all-event-listeners'
import { App } from './app'
import { getViewManager } from './handler-manager'
import { DbLoggerWrapper } from './middleware/loggers'

export default (env: Env): App => {
  const logger = new DbLoggerWrapper(sentry)
  const db = getNeonDrizzleWsClient(env.POSTGRES_URL, env.POSTGRES_READ_URL, logger)
  const db_client = new DbClient(db, logger)
  return new App(env, getViewManager(), all_event_listeners, { db: db_client })
}
