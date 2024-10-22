import { Router } from 'itty-router'
import { initSentry, sentry } from './logging'
import { apiRouter } from './main/api/api_router'
import { authorize } from './main/api/authorize'
import { oauthRouter } from './main/api/oauth'
import { updateRouter } from './main/api/update_app'
import { handleInteractionRequest } from './main/bot/manage-views/handle_interaction_request'
import { App } from './main/context/app_context'
import { runTests } from './main/test/test'

export default {
  fetch(request: Request, env: Env, execution_context: ExecutionContext) {
    initSentry(request, env, execution_context)

    const app = new App(env)

    const router = Router()
      .post('/interactions', request => handleInteractionRequest(app, request))

      .get(`/oauth/*`, request => oauthRouter(app).handle(request))

      .all('/api/*', request => apiRouter(app).handle(request))

      .post('/update/*', authorize(env), request => updateRouter(app).handle(request))

      .post('/test/*', authorize(env), () => runTests(app))

      .get('*', () => new Response(`👀`))

      .all('*', () => new Response('Not Found', { status: 404 }))

    return sentry.withLogging(router.handle)
  },
}
