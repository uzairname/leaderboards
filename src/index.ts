import { Env } from './utils/env'
import { config, initConfig, initSentry, sentry } from './utils/globals'
import { router } from './core/router'

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    initConfig(env, ctx)
    initSentry(request, config)
    return sentry.handler(router().handle)
  },
}
