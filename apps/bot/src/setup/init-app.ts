import { DbClient, getNeonDrizzleWsClient } from '@repo/db'
import { Env } from '../Env'
import { sentry } from '../logging/sentry'
import { DbLoggerWrapper } from '../logging/wrappers'
import { App } from './app'
import { initInteractionHandler } from './interaction-handler'

export default (env: Env): App => {
  const logger = new DbLoggerWrapper(sentry)
  const db = getNeonDrizzleWsClient(env.POSTGRES_URL, env.POSTGRES_READ_URL, logger)
  const db_client = new DbClient(db, logger)
  return new App(env, initInteractionHandler(), [], { db: db_client })
}
