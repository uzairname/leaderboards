import { Env } from './utils/request'
import { initSentry } from './utils/globals'
import { router } from './app/router'

export default {
  fetch: (request: Request, env: Env, execution_context: ExecutionContext) => {
    const req = { request, env, execution_context }
    const sentry = initSentry(req)
    return sentry.handler(router(req, sentry).handle)
  },
}
