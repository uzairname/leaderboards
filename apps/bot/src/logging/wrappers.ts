import { RequestData } from '@discordjs/rest'
import { DbLogger } from '@repo/db'
import { DiscordLogger, LogLevel } from '@repo/discord'
import { truncateString } from '@repo/utils'
import { Logger } from './logger'

export class DbLoggerWrapper extends DbLogger {
  constructor(private sentry: Logger) {
    super()
  }

  log({ data, category, type }: { data?: Record<string, unknown>; category?: string; type?: string }) {
    if (data) {
      this.sentry.addBreadcrumb({ data, category, type })
    }
  }

  debug(...message: unknown[]) {
    this.sentry.debug(...message)
  }

  logQuery(query: string, params?: unknown[], is_readonly?: boolean): void {
    if (is_readonly) {
      this.sentry.request_data['queries-readonly'] = ((this.sentry.request_data['queries-readonly'] as number) || 0) + 1
    } else {
      this.sentry.request_data['queries'] = ((this.sentry.request_data['queries'] as number) || 0) + 1
    }

    this.sentry.addBreadcrumb({
      data: {
        query: query,
        params: params,
      },
      category: `drizzle` + (is_readonly ? `-readonly` : ``),
      type: 'query',
    })
  }

  resetCounter(is_readonly?: boolean): void {
    this.sentry.request_data[is_readonly ? 'queries-readonly' : 'queries'] = 0
  }
}

export class DiscordLoggerWrapper extends DiscordLogger {
  constructor(private sentry: Logger) {
    super()
  }

  log(data: { message: string; data?: Record<string, unknown>; level?: LogLevel }) {
    this.sentry.addBreadcrumb({
      ...data,
      level: data.level ?? 'info',
    })
  }

  debug(...messages: unknown[]): void {
    this.sentry.debug(...messages)
  }

  logDiscordRequest({
    method,
    route,
    options,
    response,
    error,
    time_ms,
  }: {
    method: string
    route: string
    options?: RequestData
    response?: unknown
    error?: unknown
    time_ms: number
  }) {
    this.sentry.addBreadcrumb({
      type: 'http',
      level: error ? 'error' : 'info',
      message: `Fetched Discord ${method} ${route}`,
      data: {
        options: truncateString(JSON.stringify(options) ?? '', 500),
        response: truncateString(JSON.stringify(response) ?? '', 500),
        error: truncateString(JSON.stringify(error) ?? '', 500),
        time: `${time_ms} ms`,
      },
    })
    this.sentry.request_data['discord_requests'] = ((this.sentry.request_data['discord_requests'] as number) || 0) + 1
  }

  setInteractionType(type: string): void {
    this.sentry.request_name = type
  }

  setUser({ id, username, guild }: { id: string; username: string; guild?: string }): void {
    this.sentry.setUser({
      id: id ?? username,
      user_id: id ?? username,
      username,
      guild,
    })
  }
}
