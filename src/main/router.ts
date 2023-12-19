import { Router } from 'itty-router'
import { respondToInteraction } from '../discord-framework'
import { authorize, RequestArgs } from '../request/request'
import { sentry, initSentry } from '../request/sentry'
import { runTests } from '../test/test'
import { apiRouter } from './api/router'
import { App } from './app/app'
import { findView } from './app/find_view'
import { initApp } from './app/init_app'
import { oauthRouter } from './modules/oauth'
import { onViewError } from './views/utils/on_view_error'

export function respond(req: RequestArgs): Promise<Response> {
  initSentry(req)

  const app = new App(req.env)

  const router = Router()
    .get('/', () => new Response(`👀`))

    .post('/interactions', request =>
      respondToInteraction(app.bot, request, findView(app), onViewError(app)),
    )

    .get(`/oauth/*`, request => oauthRouter(app).handle(request))

    .post('/init/*', authorize(req), () => initApp(app))

    .all('/api/*', request => apiRouter(app).handle(request))

    .post('/test/*', authorize(req), () => runTests(app))

    .all('*', () => new Response('Not Foun', { status: 404 }))

  return sentry.handlerWrapper(router.handle)
}
