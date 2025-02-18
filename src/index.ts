import initApp from './bot/init-app'
import router from './bot/routers/base'
import { Env } from './Env'
import { initSentry, sentry } from './logging/sentry'

export default {
  fetch(request: Request, env: Env, execution_context: ExecutionContext) {
    initSentry(request, env, execution_context)

    const app = initApp(env)
    console.log(env.APP_KEY)

    return sentry.withLogging(router(app).handle)
  },
}
