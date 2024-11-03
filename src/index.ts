import { Router } from 'itty-router'
import { Env } from './Env'
import { initSentry, sentry } from './logging/sentry'
import apiRouter from './main/api/api-router'
import authorize from './main/api/authorize'
import oauthRouter from './main/api/oauth-router'
import updateRouter from './main/api/update-router'
import initApp from './main/init-app'
import { runTests } from './main/test/test'

export default {
  fetch(request: Request, env: Env, execution_context: ExecutionContext) {
    initSentry(request, env, execution_context)

    const app = initApp(env)

    const router = Router()
      .post('/interactions', request => app.handleInteractionRequest(request))

      .get(`/oauth/*`, request => oauthRouter(app).handle(request))

      .all('/api/*', request => apiRouter(app).handle(request))

      .post('/update/*', authorize(env), request => updateRouter(app).handle(request))

      .all('/test/*', () => runTests(app))

      .get('*', () => new Response(`👀`))

      .all('*', () => new Response('Not Found', { status: 404 }))

    return sentry.withLogging(router.handle)
  },
}
