import { ansicolors, isInt, log } from '@repo/utils'
// import { Breadcrumb, BreadcrumbHint, EventHint } from '@sentry/types'
// import { Toucan } from 'toucan-js'
import * as sentry from '@sentry/cloudflare'
import { AppErrors } from '../errors/app-errors'

export let request_num: number | undefined = undefined

export class Logger {
  public time_received = Date.now()
  private caught_exception: unknown
  private active_offloads = new Map<string, { startTime: number; name: string }>()
  public timeout_ms: number = 20000

  request_data: Record<string, unknown> = {}
  discord_user: Record<string, unknown> = {}
  request_name: string

  constructor(
    private request: Request,
    private execution_context: ExecutionContext,
    public log_to_console: boolean = false,
  ) {
    this.log({
      message: `Logger initialized`
    })
    this.request_name = 'Request'
    request_num = isInt(request_num) ? request_num + 1 : 1
    this.request = request
  }

  async withLogging(handler: (request: Request) => Promise<Response>): Promise<Response> {
    sentry.setTag('cold-start', request_num == 1)
    sentry.setTag('request_num', request_num)

    this.request_name = `${this.request.method} ${new URL(this.request.url).pathname}`

    return handler(this.request)
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
    callback: (ctx: { setException: (e: unknown) => void; setRequestName: (name: string) => void }) => Promise<void>,
    onTimeout?: (e: AppErrors.RequestTimeoutError) => Promise<void>,
    name?: string,
  ): void {
    const request_name = `${this.request_name}${name ? `/${name}` : '/followup'}`
    const startTime = Date.now()

    // Track this offload
    const offloadId = `${Date.now()}-${Math.random()}`
    this.active_offloads.set(offloadId, { startTime, name: request_name })

    let offload_caught_exception: unknown

    const ctx = {
      setException: (e: unknown) => {
        offload_caught_exception = e
      },
      setRequestName: (name: string) => {
        // Update the tracked name
        const tracked = this.active_offloads.get(offloadId)
        if (tracked) {
          tracked.name = name
        }
      },
    }

    // Create a proper timeout promise that resolves after timeout
    const timeout_promise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        const e = new AppErrors.RequestTimeoutError(request_name, this.timeout_ms)
        sentry.captureMessage(`${request_name} taking longer than ${this.timeout_ms / 1000}s`, 'warning')
        onTimeout?.(e)
        reject(e)
      }, this.timeout_ms) // Use instance timeout instead of hardcoded value
    })

    const callback_promise = callback(ctx)
      .then(() => {
        if (offload_caught_exception) {
          this.captureException(offload_caught_exception)
          if (this.log_to_console) console.error(offload_caught_exception)
        } else {
          this.logResult(request_name)
        }
      })
      .catch(e => {
        if (this.log_to_console) console.error(e)
        this.captureException(e)
      })
      .finally(() => {
        // Clean up tracking
        this.active_offloads.delete(offloadId)
      })

    const result = Promise.race([timeout_promise, callback_promise]).catch(e => {
      // Handle timeout errors gracefully
      if (e instanceof AppErrors.RequestTimeoutError) {
        this.log({message: e.message, level: 'error'})
      }
    })

    this.execution_context.waitUntil(result)
  }

  // Add method to get active offloads for monitoring
  public getActiveOffloads(): Array<{ id: string; name: string; duration: number }> {
    const now = Date.now()
    return Array.from(this.active_offloads.entries()).map(([id, { startTime, name }]) => ({
      id,
      name,
      duration: now - startTime,
    }))
  }

  // Add method to log stuck requests
  public logStuckRequests(): void {
    const stuckRequests = this.getActiveOffloads().filter(req => req.duration > this.timeout_ms * 2) // Log requests that are 2x timeout

    if (stuckRequests.length > 0) {
      sentry.captureMessage(`Found ${stuckRequests.length} potentially stuck requests`, {
        extra: {
          stuck_requests: stuckRequests,
          request_name: this.request_name,
          total_duration: Date.now() - this.time_received,
        },
        level: 'warning',
      })
    }
  }

  log(breadcrumb: sentry.Breadcrumb, hint?: sentry.BreadcrumbHint): void {

    if (breadcrumb.level !== 'debug') {
      // Dont log debug breadcrumbs to Sentry
      sentry.addBreadcrumb(breadcrumb, hint)
    }
    if (this.log_to_console && breadcrumb.message) {
      if (breadcrumb.level === 'warning' || breadcrumb.level === 'error') {
        log('red', `[${breadcrumb.level}] ${breadcrumb.message}`)
      } else if (breadcrumb.category === 'dbmethod') {
        log('blue', `[dbmethod] ${breadcrumb.message}`)
      } else if (breadcrumb.category === 'appmethod') {
        log('magenta', `[appmethod] ${breadcrumb.message}`)
      } else {
        console.log(breadcrumb.message)
      }
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
    if (this.log_to_console) {
      console.debug('[debug]', ...message)
    }
  }

  private logResult(request_name?: string) {
    sentry.setExtras({
      'time taken': `${Date.now() - this.time_received} ms`,
      data: this.request_data,
      user: this.discord_user,
    })
    sentry.captureEvent({
      message: request_name ?? this.request_name,
      level: 'info',
    })
    if (this.log_to_console) {
      console.log(`Request completed: ${request_name ?? this.request_name} in ${Date.now() - this.time_received} ms`)
    }
  }
}

// export function debug(...message: unknown[]): void {
//   sentry.addBreadcrumb({
//     message: message.map(m => `${m}`).join(' '),
//     level: 'debug',
//   })
// }
