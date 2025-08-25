import { addStyle, isInt, log } from '@repo/utils'
import * as sentry from '@sentry/cloudflare'
import { AppErrors } from '../errors/app-errors'

export let request_num: number | undefined = undefined

export class Logger {
  private caught_exception: unknown
  public readonly timeout_ms: number = 30000

  discord_user: Record<string, unknown> = {}
  execution_name: string = 'Request'

  constructor(
    public waitUntil: ((promise: Promise<any>) => void) | undefined,
    public readonly log_to_console: boolean = false,
    public readonly time_received: number = Date.now(),
    public readonly request_data: Record<string, unknown> = {},
    public parent?: Logger,
  ) {
    this.log({
      message: `Logger initialized`,
    })
    request_num = isInt(request_num) ? request_num + 1 : 1
  }

  async run(request: Request, handler: (request: Request) => Promise<Response>): Promise<Response> {
    sentry.setTag('cold-start', request_num == 1)
    sentry.setTag('request_num', request_num)

    this.execution_name = request ? `${request.method} ${new URL(request.url).pathname}` : 'main'

    return handler(request)
      .then(res => {
        if (this.caught_exception) {
          if (this.log_to_console) console.error(this.caught_exception)
          this.captureException(this.caught_exception)
        } else {
          this.logResult()
        }
        return res
      })
      .catch(e => {
        this.captureException(e)
        if (this.log_to_console) console.error(e)
        return new Response(`Internal Server Error: ${e}`, { status: 500 })
      })
  }

  public updateRequestData(key: string, value: unknown): void {
    this.request_data[key] = value
    if (this.parent) {
      return this.parent.updateRequestData(key, value)
    }
  }

  initializeChild() {
    const new_logger = new Logger(this.waitUntil, this.log_to_console, this.time_received, this.request_data, this)
    new_logger.execution_name = this.execution_name
    return new_logger
  }

  /**
   * Offload a task to be run asynchronously, with proper error handling and timeout.
   * @param callback The async function to run. Receives a context object with these methods:
   * - setException(e: unknown): void - Call this to log an exception when the callback finishes,
   *   without throwing it.
   * - setRequestName(name: string): void - Call this to set a custom name to log the offloaded request.
   * @param onTimeout Optional function to call if the task times out.
   * @param name Optional name to append to the request name for logging.
   */
  public offload(
    callback: (ctx: { logger: Logger; setException: (e: unknown) => void }) => Promise<void>,
    name?: string,
  ): void {
    let offload_caught_exception: unknown
    const new_logger = this.initializeChild()
    new_logger.execution_name += `/${name ?? `offloaded`}`
    const execution_name = new_logger.execution_name

    const ctx = {
      logger: new_logger,
      setException: (e: unknown) => {
        offload_caught_exception = e
      },
    }

    // A timeout promise that resolves after timeout
    const timeout_promise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        const e = new AppErrors.RequestTimeoutError(execution_name, this.timeout_ms)
        sentry.captureMessage(`${execution_name} taking longer than ${this.timeout_ms / 1000}s`, 'warning')
        reject(e)
      }, this.timeout_ms) // Use instance timeout instead of hardcoded value
    })

    const callback_promise = callback(ctx)
      .then(() => {
        if (offload_caught_exception) {
          this.captureException(offload_caught_exception)
          if (this.log_to_console) console.error(offload_caught_exception)
        } else {
          this.logResult(execution_name)
        }
      })
      .catch(e => {
        if (this.log_to_console) console.error(e)
        this.captureException(e)
      })
      .finally(() => {
        // Clean up tracking
        // this.active_offloads.delete(offloadId)
      })

    const result = Promise.race([timeout_promise, callback_promise]).catch(e => {
      // Handle timeout errors gracefully
      if (e instanceof AppErrors.RequestTimeoutError) {
        this.log({ message: e.message, level: 'error' })
      }
    })

    this.waitUntil?.(result)
  }

  log(breadcrumb: sentry.Breadcrumb, hint?: sentry.BreadcrumbHint): void {
    if (breadcrumb.level !== 'debug') {
      // Dont log debug breadcrumbs to Sentry
      sentry.addBreadcrumb(breadcrumb, hint)
    }

    if (this.log_to_console && breadcrumb.message) {
      const time_ms = Date.now() - this.time_received
      const time_and_requestname = addStyle(`[${time_ms}ms] ${this.execution_name} | `, 'white', 'italic')
      const message_txt = breadcrumb.message

      let message: string = message_txt

      if (breadcrumb.level === 'warning' || breadcrumb.level === 'error') {
        message = addStyle(`[${breadcrumb.level}] ${message_txt}`, 'red')
      } else if (breadcrumb.level === 'debug') {
        message = addStyle(`[${breadcrumb.level}] ${message_txt}`, 'gray')
      } else if (breadcrumb.category === 'dbmethod') {
        message = addStyle(`[db method] ${message_txt}`, 'cyan')
      } else if (breadcrumb.category === 'appmethod') {
        message = addStyle(`[app method] ${message_txt}`, 'magenta')
      } else if (breadcrumb.category === 'discord_request') {
        message = addStyle(`[discord] ${message_txt}`, 'blue')
      } else {
        message = addStyle(`[info] ${message_txt}`, 'white')
      }

      console.log(time_and_requestname + message)
    }
  }

  captureException(exception: unknown, hint?: sentry.EventHint): string {
    this.log({
      message: `Exception`,
      level: 'error',
      data: { exception },
    })
    return sentry.captureException(exception, hint)
  }

  setException(exception: unknown): void {
    this.log({
      message: `Caught exception`,
      level: 'error',
      data: { exception },
    })
    this.caught_exception = exception
  }

  debug(...message: unknown[]): void {
    this.log({
      message: message.map(m => `${m}`).join(' '),
      level: 'debug',
    })
  }

  private logResult(request_name?: string, offloaded_start_time?: number) {
    sentry.setExtras({
      'time taken': `${Date.now() - this.time_received} ms`,
      data: this.request_data,
      user: this.discord_user,
    })
    sentry.captureEvent({
      message: request_name ?? this.execution_name,
      level: 'info',
    })

    if (this.log_to_console) {
      log(
        `[Request Completed] ${request_name ?? this.execution_name} finished in ${Date.now() - (offloaded_start_time ?? this.time_received)} ms`,
        `yellow`,
      )
    }
  }

  /**
   * Returns the amount of time since the request was received
   */
  public getTime() {}
}
