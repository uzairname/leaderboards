// import { Breadcrumb, BreadcrumbHint } from '@sentry/types'
import { Toucan } from 'toucan-js'
import { cache } from './main/cache'

export let sentry: Logger

export function initSentry(request: Request, env: Env, execution_context: ExecutionContext) {
  sentry = new Logger(request, env, execution_context)
  return sentry
}

export class Logger extends Toucan {
  private time_received = Date.now()
  private caught_exception: unknown

  request_data: Record<string, unknown> = {}
  request_name: string

  constructor(
    private request: Request,
    private env: Env,
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
    cache.request_num = typeof cache.request_num == 'number' ? cache.request_num + 1 : 1
    this.request = request
  }

  async withLogging(handler: (request: Request) => Promise<Response>): Promise<Response> {
    this.setTag('cold-start', `${cache.request_num == 1}`)
    this.debug(`Request #${cache.request_num}`)
    this.request_name = `${this.request.method} ${new URL(this.request.url).pathname}`

    return new Promise<Response>((resolve, reject) => {
      const timeout_ms = 20000
      setTimeout(() => {
        reject(new TimeoutError(`${this.request_name} timed out after ${timeout_ms} ms`))
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
  ): void {
    let offload_caught_exception: unknown
    let request_name = `${this.request_name} followup`

    const ctx = {
      setException: (e: unknown) => {
        this.addBreadcrumb({
          message: `Caught exception`,
          level: 'error',
          data: { e },
        })
        offload_caught_exception = e
      },
      setRequestName: (name: string) => {
        request_name = name
      },
    }

    // try executing callback. If it takes longer than 20 seconds, log a timeout error. If not, cancel the timeout and log the result
    this.execution_context.waitUntil(
      new Promise<void>((resolve, reject) => {
        const timeout_ms = 20000
        setTimeout(() => {
          reject(new TimeoutError(`"${request_name}" timed out after ${timeout_ms} ms`))
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

class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = TimeoutError.name
  }
}
