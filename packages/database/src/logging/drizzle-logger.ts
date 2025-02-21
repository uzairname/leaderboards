import { Logger } from 'drizzle-orm'
import { DbLogger } from './db-logger'

export class DrizzleLogger implements Logger {
  constructor(
    private logger?: DbLogger,
    private is_readonly?: boolean,
  ) {
    logger?.resetCounter()
  }

  logQuery(query: string, params?: unknown[]): void {
    if (this.logger) {
      this.logger.logQuery(query, params, this.is_readonly)
    } else {
      console.log(
        `[drizzle${
          this.is_readonly ? `-readonly` : ``
        }] ${query}\n${params ? JSON.stringify(params) : ``}`,
      )
    }
  }
}
