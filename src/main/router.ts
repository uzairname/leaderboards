import * as D from 'discord-api-types/v10'
import { Router } from 'itty-router'
import { respondToDiscordInteraction } from '../discord-framework'
import { authorize } from '../request/request'
import { RequestArgs } from '../request/request'
import { sentry } from '../request/sentry'
import { initSentry } from '../request/sentry'
import { runTests } from '../test/test'
import { apiRouter } from './api/router'
import { App } from './app/app'
import { deployApp } from './app/deploy_app'
import { findView } from './app/find_view'
import { oauthCallback, oauthRedirect } from './modules/oauth'
import { onViewError } from './views/utils/on_view_error'

export function respond(req: RequestArgs): Promise<Response> {
  initSentry(req)
  const app = new App(req)
  const config = app.config

  const route = Router()
    .get('/', () => {
      return new Response(`👀`)
    })

    .post('/interactions', request => {
      return respondToDiscordInteraction(
        app.bot,
        request,
        findView(app),
        onViewError(app),
        app.config.features.DIRECT_RESPONSE
      )
    })

    .get(config.routes.OAUTH_LINKED_ROLES, () => {
      return oauthRedirect(app, [D.OAuth2Scopes.Identify, D.OAuth2Scopes.RoleConnectionsWrite])
    })

    .get(config.routes.OAUTH_CALLBACK, request => {
      return oauthCallback(app, request)
    })

    .post('/init', authorize(req), async () => {
      await deployApp(app)
      return new Response(`Deployed Leaderboards bot (${app.config.env.ENVIRONMENT})`)
    })

    .all('/api', async request => {
      return apiRouter(app).handle(request)
    })

    .post('/test', authorize(req), async () => {
      return await runTests(app)
    })

    .all('*', () => new Response('Not Found', { status: 404 }))

  return sentry.handlerWrapper(route.handle)
}
