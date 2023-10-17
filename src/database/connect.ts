import { Pool } from '@neondatabase/serverless'
import { NeonDatabase, drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from './schema'
import { Logger } from 'drizzle-orm'
import { Sentry } from '../utils/sentry'

export function connect(connection_string: string, sentry?: Sentry): NeonDatabase<typeof schema> {
  const pool = new Pool({
    connectionString: connection_string,
  })
  const logger = new DrizzleLogger(sentry)
  return drizzle(pool, {
    logger,
  })
}

class DrizzleLogger implements Logger {
  constructor(private sentry?: Sentry) {}

  logQuery(query: string, params?: unknown[]): void {
    if (this.sentry === undefined) return

    this.sentry.addBreadcrumb({
      data: {
        query: query,
        params: params,
      },
      category: 'database',
      type: 'query',
      level: 'info',
    })
  }
}
