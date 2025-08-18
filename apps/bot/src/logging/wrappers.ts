import { RequestData } from '@discordjs/rest'
import { DbLogger } from '@repo/db'
import { DiscordLogger, LogLevel } from '@repo/discord'
import { truncateString } from '@repo/utils'
import { Logger } from './logger'

/**
 * A subclass of DbLogger that sends logs to a Logger instance.
 */
export class AppDbLogger extends DbLogger {
  constructor(private logger: Logger) {
    super()
  }

  log({ data, category, type }: { data?: Record<string, unknown>; category?: string; type?: string }) {
    if (data) {
      this.logger.addBreadcrumb({ data, category, type })
    }
  }

  debug(...message: unknown[]) {
    this.logger.debug(...message)
  }

  logQuery(query: string, params?: unknown[], is_readonly?: boolean): void {
    if (is_readonly) {
      this.logger.request_data['queries-readonly'] = ((this.logger.request_data['queries-readonly'] as number) || 0) + 1
    } else {
      this.logger.request_data['queries'] = ((this.logger.request_data['queries'] as number) || 0) + 1
    }

    this.logger.addBreadcrumb({
      data: {
        query: query,
        params: params,
      },
      category: `drizzle` + (is_readonly ? `-readonly` : ``),
      type: 'query',
    })
  }

  resetCounter(is_readonly?: boolean): void {
    this.logger.request_data[is_readonly ? 'queries-readonly' : 'queries'] = 0
  }
}

/**
 * A subclass of DiscordLogger that sends logs to a Logger instance.
 */
export class AppDiscordLogger extends DiscordLogger {
  constructor(private logger: Logger) {
    super()
  }

  log(data: { message: string; data?: Record<string, unknown>; level?: LogLevel }) {
    this.logger.addBreadcrumb({
      ...data,
      level: data.level ?? 'info',
    })
  }

  debug(...messages: unknown[]): void {
    this.logger.debug(...messages)
  }

  logDiscordRequest({
    method,
    route,
    options,
    response,
    error,
    timeMs,
  }: {
    method: string
    route: string
    options?: RequestData
    response?: unknown
    error?: unknown
    timeMs: number
  }) {
    this.logger.addBreadcrumb({
      type: 'http',
      level: error ? 'error' : 'info',
      message: `Fetched Discord ${method} ${route}`,
      data: {
        options: truncateString(JSON.stringify(options) ?? '', 500),
        response: truncateString(JSON.stringify(response) ?? '', 500),
        error: truncateString(JSON.stringify(error) ?? '', 500),
        time: `${timeMs} ms`,
      },
    })
    this.logger.request_data['discord_requests'] = ((this.logger.request_data['discord_requests'] as number) || 0) + 1
  }

  setRequestName(name: string): void {
    this.logger.request_name = name
  }

  setUser({ id, username, guild_id }: { id: string; username: string; guild_id?: string }): void {
    this.logger.discord_user = {
      id: id,
      username,
      guild_id,
    }
  }
}
