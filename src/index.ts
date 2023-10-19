import { Env } from './config/env'
import { config, initConfig, initSentry, sentry } from './utils/globals'
import { router } from './app/router'

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    initConfig(env, ctx)
    initSentry(request, config)
    return sentry.handler(router().handle)
  },
}
