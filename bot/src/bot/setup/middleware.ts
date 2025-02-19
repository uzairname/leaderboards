import { CustomLogger } from 'database/drizzle-client'
import { Logger } from '../../logging/Logger'

export class DbLogger extends CustomLogger {
  constructor(private sentry: Logger) {
    super()
  }

  log({
    data,
    category,
    type,
  }: {
    data?: Record<string, unknown>
    category?: string
    type?: string
  }) {
    if (data) {
      this.sentry.addBreadcrumb({ data, category, type })
    }
  }

  debug(...message: unknown[]) {
    this.sentry.debug(...message)
  }
}
