import { Toucan } from 'toucan-js'
import { cache } from './cache'
import { RequestArgs } from './request'

export let sentry: Sentry

export function initSentry(ctx: RequestArgs) {
  sentry = new Sentry(ctx)
  return sentry
}

export class Sentry extends Toucan {
  private time_received = Date.now()
  private caught_exception: unknown
  private request: Request

  request_data: Record<string, unknown> = {}
  request_name: string

  constructor(private request_args: RequestArgs) {
    super({
      dsn: request_args.env.SENTRY_DSN,
      release: '1.0.0',
      environment: request_args.env.ENVIRONMENT,
      context: request_args.execution_context,
      request: request_args.request,
    })

    this.request_name = 'Request'
    cache.request_num = (typeof cache.request_num == 'number' ? cache.request_num : 0) + 1
    this.request = request_args.request
  }

  async handlerWrapper(handler: (request: Request) => Promise<Response>): Promise<Response> {
    this.setTag('cold-start', `${cache.request_num == 1}`)
    this.request_name = `${this.request.method} ${new URL(this.request.url).pathname}`
    this.addBreadcrumb({
      message: `Received request #${cache.request_num}`,
      level: 'info',
    })

    return await new Promise<Response>((resolve, reject) => {
      const timeout_ms = 5000
      const timeout = setTimeout(() => {
        reject(new TimeoutError(`${this.request_name} timed out after ${timeout_ms} ms`))
      }, timeout_ms)

      handler(this.request)
        .then(res => {
          clearTimeout(timeout)
          if (this.caught_exception) reject(this.caught_exception)
          resolve(res)
        })
        .catch(e => {
          clearTimeout(timeout)
          reject(e)
        })
    })
      .then(res => {
        this.logResult()
        return res
      })
      .catch(e => {
        this.captureException(e)
        return new Response('Internal Server Error', { status: 500 })
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
        offload_caught_exception = e
      },
      setRequestName: (name: string) => {
        request_name = name
      },
    }

    // try executing callback. If it takes longer than 20 seconds, log a timeout error. If not, cancel the timeout and log the result
    this.request_args.execution_context.waitUntil(
      new Promise<void>((resolve, reject) => {
        const timeout_ms = 10000
        const timeout = setTimeout(() => {
          reject(new TimeoutError(`"${request_name}" timed out after ${timeout_ms} ms`))
        }, timeout_ms)

        this.debug(`Offloading "${request_name}"`)

        callback(ctx)
          .then(() => {
            clearTimeout(timeout)
            this.debug(`Finished offloading "${request_name}"`)
            if (offload_caught_exception) reject(offload_caught_exception)
            resolve()
          })
          .catch(e => {
            clearTimeout(timeout)
            reject(e)
          })
      })
        .then(() => {
          this.logResult(request_name)
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
    this.setExtra('data', JSON.stringify(this.request_data))
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
