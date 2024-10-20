import { neon } from '@neondatabase/serverless'
import { Logger as BaseDrizzleLogger } from 'drizzle-orm'
import { NeonHttpDatabase, drizzle } from 'drizzle-orm/neon-http'
import { Logger } from '../../logging'
import * as schema from './schema'

export function connect(
  connection_string: string,
  sentry?: Logger,
): NeonHttpDatabase<typeof schema> {
  const sql = neon(connection_string)
  const logger = new DrizzleLogger(sentry)
  return drizzle(sql, {
    logger,
  })
}

class DrizzleLogger implements BaseDrizzleLogger {
  constructor(private sentry?: Logger) {
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
