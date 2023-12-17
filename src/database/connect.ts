import { Pool } from '@neondatabase/serverless'
import { Logger } from 'drizzle-orm'
import { NeonDatabase, drizzle } from 'drizzle-orm/neon-serverless'
import { Sentry } from '../request/sentry'
import * as schema from './schema'

export function connect(connection_string: string, sentry?: Sentry): NeonDatabase<typeof schema> {
  const pool = new Pool({
    connectionString: connection_string
  })
  const logger = new DrizzleLogger(sentry)
  return drizzle(pool, {
    logger
  })
}

class DrizzleLogger implements Logger {
  constructor(private sentry?: Sentry) {
    sentry && (sentry.request_data['queries'] = 0)
  }

  logQuery(query: string, params?: unknown[]): void {
    if (this.sentry) {
      ;(this.sentry.request_data['queries'] as number)++
      this.sentry.addBreadcrumb({
        data: {
          query: query,
          params: params
        },
        category: 'database',
        type: 'query',
        level: 'info'
      })
    } else {
      console.log('query', query, params)
    }
  }
}
