import { Router } from 'itty-router'
import { respondToInteraction } from './discord-framework'
import { initSentry, sentry } from './logging'
import { oauthRouter } from './main/api/oauth'
import { apiRouter } from './main/api/router'
import { initRouter as updateRouter } from './main/api/update_app'
import { App } from './main/app-context/app-context'
import { getFindViewCallback } from './main/bot/view_manager/manage_views'
import { onViewError } from './main/bot/view_manager/on_view_error'
import { runTests } from './main/test/test'

export default {
  fetch(request: Request, env: Env, execution_context: ExecutionContext) {
    initSentry(request, env, execution_context)

    const app = new App(env)

    const router = Router()
      .post('/interactions', request =>
        respondToInteraction(app.bot, request, getFindViewCallback(app), onViewError(app)),
      )

      .get(`/oauth/*`, request => oauthRouter(app).handle(request))

      .all('/api/*', request => apiRouter(app).handle(request))

      .post('/update/*', authorize(env), request => updateRouter(app).handle(request))

      .post('/test/*', authorize(env), () => runTests(app))

      .get('*', () => new Response(`👀`))

      .all('*', () => new Response('Not Found', { status: 404 }))

    return sentry.withLogging(router.handle)
  },
}

export const authorize = (env: Env) => (request: Request) => {
  if (request.headers.get('Authorization') !== env.APP_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }
}
