import { RequestData } from '@discordjs/rest'

export abstract class DiscordLogger {
  abstract log(params: {
    message: string
    data?: { [key: string]: any }
    level?: LogLevel
    category?: LogCategory
  }): void

  abstract debug(...messages: unknown[]): void

  abstract logDiscordRequest(params: {
    method: string
    route: string
    options?: RequestData
    response?: unknown
    error?: unknown
    time_ms: number
  }): void

  abstract setInteractionType(type: string): void

  abstract setUser(user: { id?: string; username?: string; guild?: string }): void
}

export type LogLevel = 'error' | 'warning' | 'info' | 'debug'
export type LogCategory = 'interaction'
