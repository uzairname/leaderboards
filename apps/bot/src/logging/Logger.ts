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
    const timeout_ms = 20000

    let offload_caught_exception: unknown
    let request_name = `${this.request_name}${name ? `/${name}` : '/followup'}`

    const ctx = {
      setException: (e: unknown) => {
        offload_caught_exception = e
      },
      setRequestName: (name: string) => {
        request_name = name
      },
    }

    // try executing callback. If it takes too long, log a timeout error. If not, cancel the timeout and log the result
    let timeout: NodeJS.Timeout
    const timeout_promise = new Promise<void>(() => {
      timeout = setTimeout(() => {
        const e = new AppErrors.RequestTimeoutError(request_name, this.timeout_ms)
        sentry.captureMessage(`${request_name} taking longer than ${this.timeout_ms / 1000}s`, 'warning')
        onTimeout?.(e)
      }, timeout_ms)
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

    const result = Promise.race([timeout_promise, callback_promise]).finally(() => {
      this.debug(`Finished offload ${request_name}. Clearing timeout.`)
      clearTimeout(timeout)
    })

    this.execution_context.waitUntil(result)
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
