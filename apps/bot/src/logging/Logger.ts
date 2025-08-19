import { isInt } from '@repo/utils'
import { cache } from '@repo/utils/cache'
// import { Breadcrumb, BreadcrumbHint, EventHint } from '@sentry/types'
// import { Toucan } from 'toucan-js'
import * as sentry from '@sentry/cloudflare'
import { Env } from '../Env'
import { AppErrors } from '../errors/app-errors'

export class Logger {
  private time_received = Date.now()
  private caught_exception: unknown
  private active_offloads = new Map<string, { startTime: number; name: string }>()

  request_data: Record<string, unknown> = {}
  discord_user: Record<string, unknown> = {}
  request_name: string

  constructor(
    private request: Request,
    env: Env,
    private execution_context: ExecutionContext,
    public timeout_ms: number = 20000,
  ) {
    this.request_name = 'Request'
    cache.request_num = isInt(cache.request_num) ? cache.request_num + 1 : 1
    this.request = request
  }

  async withLogging(handler: (request: Request) => Promise<Response>): Promise<Response> {
    sentry.setTag('cold-start', cache.request_num == 1)
    sentry.setTag('request_num', `${cache.request_num}`)

    this.request_name = `${this.request.method} ${new URL(this.request.url).pathname}`

    return handler(this.request)
      .then(res => {
        if (this.caught_exception) {
          this.captureException(this.caught_exception)
        } else {
          this.logResult()
        }
        return res
      })
      .catch(e => {
        this.captureException(e)
        return new Response(`Internal Server Error: ${e}`, { status: 500 })
      })
  }

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
          sentry.captureException(offload_caught_exception)
        } else {
          this.logResult(request_name)
        }
      })
      .catch(e => {
        this.captureException(e)
      })
      .finally(() => {
        // Clean up tracking
        this.active_offloads.delete(offloadId)
      })

    const result = Promise.race([timeout_promise, callback_promise]).catch(e => {
      // Handle timeout errors gracefully
      if (e instanceof AppErrors.RequestTimeoutError) {
        this.debug(`Offload ${request_name} timed out after ${this.timeout_ms}ms`)
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

  addBreadcrumb(breadcrumb: sentry.Breadcrumb, hint?: sentry.BreadcrumbHint): void {
    sentry.addBreadcrumb(breadcrumb, hint)
  }

  captureException(exception: unknown, hint?: sentry.EventHint): string {
    this.addBreadcrumb({
      message: `Exception`,
      level: 'error',
      data: { exception },
    })
    return sentry.captureException(exception, hint)
  }

  setException(exception: unknown): void {
    this.addBreadcrumb({
      message: `Caught exception`,
      level: 'error',
      data: { exception },
    })
    this.caught_exception = exception
  }

  debug(...message: unknown[]): void {
    this.addBreadcrumb({
      message: message.map(m => `${m}`).join(' '),
      level: 'debug',
    })
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
  }
}

// export function debug(...message: unknown[]): void {
//   sentry.addBreadcrumb({
//     message: message.map(m => `${m}`).join(' '),
//     level: 'debug',
//   })
// }
