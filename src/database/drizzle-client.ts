import { neon } from '@neondatabase/serverless'
import { Logger } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import { drizzle as drizzle_ws } from 'drizzle-orm/neon-serverless'
import { withReplicas } from 'drizzle-orm/pg-core'
import { Logger as RequestLogger } from '../logging/Logger'

export function getNeonDrizzleWsClient(
  postgres_url: string,
  postgres_read_url?: string,
  logger?: RequestLogger,
) {
  const db = drizzle_ws(postgres_url, { logger: new DrizzleLogger(logger) })
  if (postgres_read_url) {
    const read_db = drizzle_ws(postgres_read_url, { logger: new DrizzleLogger(logger, 'readonly') })
    return withReplicas(db, [read_db])
  }
  return db
}

export function getNeonDrizzleClient(
  postgres_url: string,
  postgres_read_url?: string,
  logger?: RequestLogger,
) {
  const sql = neon(postgres_url)

  const drizzle_logger = new DrizzleLogger(logger)
  const db = drizzle({ client: sql, logger: drizzle_logger })

  if (postgres_read_url) {
    const sql = neon(postgres_read_url)
    const read_db = drizzle({
      client: sql,
      logger: new DrizzleLogger(logger, 'readonly'),
    })

    return withReplicas(db, [read_db])
  }
  return db
}

// export type DrizzleClient = ReturnType<typeof drizzle>

class DrizzleLogger implements Logger {
  queries_key: string
  constructor(
    private logger?: RequestLogger,
    private label?: string,
  ) {
    this.queries_key = `queries` + (this.label ? `-${this.label}` : ``)
    logger && (logger.request_data[this.queries_key] = 0)
  }

  logQuery(query: string, params?: unknown[]): void {
    if (this.logger) {
      ;(this.logger.request_data[this.queries_key] as number)++
      this.logger.addBreadcrumb({
        data: {
          query: query,
          params: params,
          frame: new Error().stack,
        },
        category: `drizzle` + (this.label ? `-${this.label}` : ''),
        type: 'query',
      })
    } else {
      console.log('query', query, params)
    }
  }
}
