import { Env } from './Env'
import { initSentry, sentry } from './logging/sentry'
import router from './routers/base'
import initApp from './setup/init-app'

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext): Promise<Response> {
    initSentry(request, env, executionContext)
    const app = initApp(env)
    return sentry.withLogging(router(app).fetch)
  },
}
