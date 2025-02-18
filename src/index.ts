import { Router } from 'itty-router'
import { Env } from './Env'
import { initSentry, sentry } from './logging/sentry'
import apiRouter from './main/router/api/router'
import oauthRouter from './main/router/oauth/router'
import updateRouter from './main/router/update/router'
import initApp from './main/init-app'
import { runTests } from './main/test/test'
import router from './main/router/router'

export default {
  fetch(request: Request, env: Env, execution_context: ExecutionContext) {
    initSentry(request, env, execution_context)

    const app = initApp(env)
    console.log(env.APP_KEY)
  
    return sentry.withLogging(router(app).handle)
  },
}
