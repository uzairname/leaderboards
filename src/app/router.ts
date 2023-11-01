import { Router } from 'itty-router'
import { OAuth2Scopes } from 'discord-api-types/v10'

import { respondToDiscordInteraction } from '../discord'

import { App } from './app'
import { apiRouter } from './api/router'
import { deployBot } from './modules/deploy_bot'
import { oauthRedirect, oauthCallback } from './modules/oauth'
import { runTests } from '../../test/test'
import { findView } from './interactions/find_view'
import { onViewError } from './interactions/on_view_error'
import { constants } from '../config/config'
import { RequestArgs } from '../utils/request'
import { Sentry } from '../utils/sentry'

export const authorize = (req: RequestArgs) => (request: Request) => {
  if (request.headers.get('Authorization') !== req.env.APP_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }
}

export const router = (req: RequestArgs, sentry: Sentry) =>
  Router()
    .get('/', () => {
      return new Response(`👀`)
    })

    .post('/interactions', (request) => {
      const app = new App(req, sentry)
      return respondToDiscordInteraction(app.bot, request, findView(app), onViewError(app), false)
    })

    .get(constants.routes.OAUTH_LINKED_ROLES, () => {
      const app = new App(req, sentry)
      return oauthRedirect(app, [OAuth2Scopes.Identify, OAuth2Scopes.RoleConnectionsWrite])
    })

    .get(constants.routes.OAUTH_CALLBACK, (request) => {
      const app = new App(req, sentry)
      return oauthCallback(app, request)
    })

    .post('/init', authorize(req), async () => {
      const app = new App(req, sentry)
      await deployBot(app)
      return new Response(`Deployed Firstplace bot (${app.config.env.ENVIRONMENT})`)
    })

    .all('/api', async (request) => {
      const app = new App(req, sentry)
      return apiRouter(app).handle(request)
    })

    .post('/test', authorize(req), async () => {
      return await runTests()
    })

    .all('*', () => new Response('Not Found', { status: 404 }))
