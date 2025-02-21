import { isInt } from '@repo/utils'
import { cache } from '@repo/utils/cache'
import { Breadcrumb, BreadcrumbHint, EventHint } from '@sentry/types'
import { Toucan } from 'toucan-js'
import { Env } from '../Env'
import { RequestTimeoutError } from './errors'

export class Logger extends Toucan {
  private time_received = Date.now()
  private caught_exception: unknown

  request_data: Record<string, unknown> = {}
  request_name: string

  constructor(
    private request: Request,
    env: Env,
    private execution_context: ExecutionContext,
    public timeout_ms: number = 20000,
  ) {
    super({
      dsn: env.SENTRY_DSN,
      release: '1.0.0',
      environment: env.ENVIRONMENT,
      context: execution_context,
      request: request,
    })

    this.request_name = 'Request'
    cache.request_num = isInt(cache.request_num) ? cache.request_num + 1 : 1
    this.request = request
  }

  async withLogging(handler: (request: Request) => Promise<Response>): Promise<Response> {
    super.setTag('cold-start', cache.request_num == 1)
    super.setTag('request_num', `${cache.request_num}`)
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
    callback: (ctx: {
      setException: (e: unknown) => void
      setRequestName: (name: string) => void
    }) => Promise<void>,
    onTimeout?: (e: RequestTimeoutError) => Promise<void>,
    name?: string,
  ): void {
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
        const e = new RequestTimeoutError(request_name, this.timeout_ms)
        super.captureMessage(
          `${request_name} taking longer than ${this.timeout_ms / 1000}s`,
          'warning',
        )
        onTimeout?.(e)
      }, this.timeout_ms)
    })

    const callback_promise = callback(ctx)
      .then(() => {
        if (offload_caught_exception) {
          this.captureException(offload_caught_exception)
        } else {
          this.logResult(request_name)
        }
      })
      .catch(e => {
        this.captureException(e)
      })

    const result = Promise.race([timeout_promise, callback_promise]).finally(() => {
      clearTimeout(timeout)
    })

    this.execution_context.waitUntil(result)
  }

  addBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void {
    super.addBreadcrumb(breadcrumb, hint)
  }

  captureException(exception: unknown, hint?: EventHint): string {
    this.addBreadcrumb({
      message: `Exception`,
      level: 'error',
      data: { exception },
    })
    return super.captureException(exception, hint)
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
    console.log(...message)
    this.addBreadcrumb({
      message: message.map(m => `${m}`).join(' '),
      level: 'debug',
    })
  }

  private logResult(request_name?: string) {
    super.setExtra('time taken', `${Date.now() - this.time_received} ms`)
    super.setExtra('data', this.request_data)
    super.captureEvent({
      message: request_name ?? this.request_name,
      level: 'info',
    })
  }
}
