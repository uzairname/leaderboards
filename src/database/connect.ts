import { neon } from '@neondatabase/serverless'
import { Logger } from 'drizzle-orm'
import { NeonHttpDatabase, drizzle } from 'drizzle-orm/neon-http'
import { Sentry } from '../request/sentry'
import * as schema from './schema'

export function connect(
  connection_string: string,
  sentry?: Sentry,
): NeonHttpDatabase<typeof schema> {
  const sql = neon(connection_string)
  const logger = new DrizzleLogger(sentry)
  return drizzle(sql, {
    logger,
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
