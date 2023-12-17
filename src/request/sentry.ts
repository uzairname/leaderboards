import { Toucan } from 'toucan-js'
import { cache } from './cache'
import { RequestArgs } from './request'

export let sentry: Sentry

export function initSentry(ctx: RequestArgs) {
  sentry = new Sentry(ctx)
  return sentry
}

export class Sentry extends Toucan {
  request_name: string
  time_received = Date.now()
  private caught_exception: unknown
  request_data: Record<string, unknown> = {}

  private request: Request

  constructor(private ctx: RequestArgs) {
    super({
      dsn: ctx.env.SENTRY_DSN,
      release: '1.0.0',
      environment: ctx.env.ENVIRONMENT,
      context: ctx.execution_context,
      request: ctx.request
    })

    this.request_name = 'Request'
    cache.request_num = (typeof cache.request_num == 'number' ? cache.request_num : 0) + 1
    this.request = ctx.request
    console.log('d')
  }

  async handlerWrapper(handler: (request: Request) => Promise<Response>): Promise<Response> {
    this.setTag('cold-start', `${cache.request_num == 1}`)
    this.request_name = `${this.request.method} ${new URL(this.request.url).pathname}`
    this.addBreadcrumb({
      message: `Received request`,
      category: 'request',
      data: {
        number: cache.request_num
      }
    })

    return handler(this.request)
      .then(res => {
        this.logResult()
        return res
      })
      .catch(e => {
        this.captureException(e)
        return new Response('Internal Server Error', { status: 500 })
      })
  }

  public waitUntil(callback: Promise<void>): void {
    this.debug(`waitUntil for ${this.request_name}`)
    this.ctx.execution_context.waitUntil(
      Promise.race([
        new Promise<void>(resolve => {
          callback
            .then(() => {
              this.request_name = `${this.request_name} followup`
            })
            .catch(e => {
              this.captureException(e)
            })
            .finally(() => {
              resolve()
            })
        }),
        new Promise<void>(resolve => {
          const timeout_ms = 20000
          setTimeout(() => {
            this.caught_exception = new RequestTimeout(
              `${this.request_name} timed out after ${timeout_ms} ms`
            )
            resolve()
          }, timeout_ms)
        })
      ]).then(() => {
        this.logResult()
      })
    )
  }

  debug(...message: unknown[]): void {
    console.log(...message)
    this.addBreadcrumb({
      message: message.map(m => `${m}`).join(' '),
      level: 'debug'
    })
  }

  catchAfterResponding(e: unknown) {
    this.addBreadcrumb({
      message: `Caught exception`,
      category: 'error',
      level: 'error',
      type: 'error',
      data: {
        exception: e
      }
    })
    this.caught_exception = e
  }

  logResult() {
    if (this.caught_exception) {
      this.setExtra('time taken', `${Date.now() - this.time_received} ms`)
      this.captureException(this.caught_exception)
      this.caught_exception = undefined // for waitUntil
    } else {
      this.captureEvent({
        message: this.request_name,
        level: 'info',
        extra: {
          'time taken': `${Date.now() - this.time_received} ms`,
          data: JSON.stringify(this.request_data)
        }
      })
    }
  }
}

class RequestTimeout extends Error {
  constructor(message: string) {
    super(message)
    this.name = RequestTimeout.name
  }
}
