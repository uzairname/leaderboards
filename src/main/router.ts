import { Router } from 'itty-router'
import { respondToInteraction } from '../discord-framework'
import { authorize, RequestArgs } from '../request/request'
import { sentry, initSentry } from '../request/sentry'
import { runTests } from '../test/test'
import { apiRouter } from './api/router'
import { App } from './app/app'
import { initRouter } from './app/init/init_app'
import { oauthRouter } from './modules/oauth'
import { findView } from './modules/view_manager/manage_views'
import { onViewError } from './views/utils/on_view_error'

export function respond(req: RequestArgs): Promise<Response> {
  initSentry(req)

  const app = new App(req.env)

  const router = Router()
    .post('/interactions', request =>
      respondToInteraction(app.bot, request, findView(app), onViewError(app)),
    )

    .get(`/oauth/*`, request => oauthRouter(app).handle(request))

    .all('/api/*', request => apiRouter(app).handle(request))

    .post('/init/*', authorize(req.env), request => initRouter(app).handle(request))

    .post('/test/*', authorize(req.env), () => runTests(app))

    .get('*', () => new Response(`👀`))

    .all('*', () => new Response('Not Found', { status: 404 }))

  return sentry.handlerWrapper(router.handle)
}
