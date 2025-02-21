import { neon } from '@neondatabase/serverless'
import { drizzle as drizzle_http } from 'drizzle-orm/neon-http'
import { drizzle as drizzle_ws } from 'drizzle-orm/neon-serverless'
import { withReplicas } from 'drizzle-orm/pg-core'
import { DbLogger } from './logging/db-logger'
import { DrizzleLogger } from './logging/drizzle-logger'
// import { Logger as RequestLogger } from '../logging/Logger'

export function getNeonDrizzleWsClient(
  postgres_url: string,
  postgres_read_url?: string,
  logger?: DbLogger,
) {
  const db = drizzle_ws(postgres_url, { logger: new DrizzleLogger(logger) })
  if (postgres_read_url) {
    const read_db = drizzle_ws(postgres_read_url, { logger: new DrizzleLogger(logger, true) })
    return withReplicas(db, [read_db])
  }
  return db
}

export function getNeonDrizzleClient(
  postgres_url: string,
  postgres_read_url?: string,
  logger?: DbLogger,
) {
  const sql = neon(postgres_url)

  const drizzle_logger = new DrizzleLogger(logger)
  const db = drizzle_http({ client: sql, logger: drizzle_logger })

  if (postgres_read_url) {
    const sql = neon(postgres_read_url)
    const read_db = drizzle_http({
      client: sql,
      logger: new DrizzleLogger(logger, true),
    })

    return withReplicas(db, [read_db])
  }
  return db
}
