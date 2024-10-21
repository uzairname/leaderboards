import { neon } from '@neondatabase/serverless'
import { Logger as BaseDrizzleLogger } from 'drizzle-orm'
import { NeonHttpDatabase, drizzle } from 'drizzle-orm/neon-http'
import { Logger } from '../../logging'
import * as schema from './schema'

export function connect(
  connection_string: string,
  logger?: Logger,
): NeonHttpDatabase<typeof schema> {
  const sql = neon(connection_string)
  const drizzle_logger = new DrizzleLogger(logger)
  return drizzle(sql, {
    logger: drizzle_logger,
  })
}

class DrizzleLogger implements BaseDrizzleLogger {
  constructor(private logger?: Logger) {
    logger && (logger.request_data['queries'] = 0)
  }

  logQuery(query: string, params?: unknown[]): void {
    if (this.logger) {
      ;(this.logger.request_data['queries'] as number)++
      this.logger.addBreadcrumb({
        data: {
          query: query,
          params: params,
        },
        category: 'Drizzle',
        type: 'query',
      })
    } else {
      console.log('query', query, params)
    }
  }
}
