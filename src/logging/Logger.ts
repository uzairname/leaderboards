import { EventHint } from '@sentry/types'
import { Toucan } from 'toucan-js'
import { Env } from '../Env'
import { cache } from '../utils/cache'
import { isInt } from '../utils/utils'
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
    this.setTag('cold-start', cache.request_num == 1)
    this.setTag('request_num', `${cache.request_num}`)
    this.request_name = `${this.request.method} ${new URL(this.request.url).pathname}`

    return new Promise<Response>((resolve, reject) => {
      const warning_ms = 10000
      const timeout_ms = 120000
      setTimeout(() => {
        this.captureMessage(
          `${this.request_name} taking longer than ${warning_ms / 1000}s`,
          'warning',
        )
      }, warning_ms)

      setTimeout(() => {
        reject(new RequestTimeoutError(this.request_name, timeout_ms))
      }, timeout_ms)

      handler(this.request)
        .then(res => {
          resolve(res)
        })
        .catch(e => {
          reject(e)
        })
    })
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
        return new Response(`Internal Server Error ${e}`, { status: 500 })
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

    // try executing callback. If it takes longer than 20 seconds, log a timeout error. If not, cancel the timeout and log the result
    this.execution_context.waitUntil(
      new Promise<void>((resolve, reject) => {
        const warning_ms = 10000
        const timeout_ms = 30000
        setTimeout(() => {
          this.captureMessage(
            `${this.request_name} taking longer than ${warning_ms / 1000}s`,
            'warning',
          )
        }, warning_ms)

        setTimeout(async () => {
          this.captureMessage(
            `${this.request_name} taking longer than ${timeout_ms / 1000}s`,
            'warning',
          )
          const e = new RequestTimeoutError(request_name, timeout_ms)
          onTimeout?.(e)
          reject(e)
        }, timeout_ms)

        this.debug(`Offloading "${request_name}"`)

        callback(ctx).catch(reject).finally(resolve)
      })
        .then(() => {
          if (offload_caught_exception) {
            this.captureException(offload_caught_exception)
          } else {
            this.logResult(request_name)
          }
        })
        .catch(e => {
          this.captureException(e)
        }),
    )
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

  private logResult(request_name: string = this.request_name) {
    this.setExtra('time taken', `${Date.now() - this.time_received} ms`)
    this.setExtra('data', this.request_data)
    this.captureEvent({
      message: request_name,
      level: 'info',
    })
  }
}
