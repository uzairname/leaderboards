import { neon } from '@neondatabase/serverless'
import { Logger } from 'drizzle-orm'
import { drizzle as drizzleNeon, NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { Logger as RequestLogger } from '../logging/Logger'
import * as schema from './schema'

export function getNeonDrizzleClient(
  connection_string: string,
  logger?: RequestLogger,
): NeonHttpDatabase<typeof schema> {
  const sql = neon(connection_string)
  const drizzle_logger = new DrizzleLogger(logger)
  return drizzleNeon(sql, {
    logger: drizzle_logger,
  })
}

export type DrizzleClient = ReturnType<typeof getNeonDrizzleClient>

class DrizzleLogger implements Logger {
  constructor(private logger?: RequestLogger) {
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
