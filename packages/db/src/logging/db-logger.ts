export abstract class DbLogger {
  request_data: Record<string, unknown> = {}

  abstract log({ data, category, type }: { data?: Record<string, unknown>; category?: string; type?: string }): void

  abstract debug(...message: unknown[]): void

  abstract logQuery(query: string, params?: unknown[], is_readonly?: boolean): void

  abstract resetCounter(is_readonly?: boolean): void
}
