import { Pool } from '@neondatabase/serverless'
import { NeonDatabase, drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from './schema'
import { Logger } from 'drizzle-orm'
import { Sentry } from '../logging/sentry'

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
    if (this.sentry) {
      this.sentry.addBreadcrumb({
        data: {
          query: query,
          params: params,
        },
        category: 'database',
        type: 'query',
        level: 'info',
      })
    } else {
      console.log('query', query, params)
    }
  }
}
