import { Router } from 'itty-router'
import { OAuth2Scopes } from 'discord-api-types/v10'

import { respondToDiscordInteraction } from '../discord'

import { App } from './app'
import { deployBot } from './modules/deploy_bot'
import { oauthRedirect, oauthCallback } from './modules/oauth'
import { runTests } from '../../test/test'
import { findView } from './interactions/handler/view_manager'
import { onViewError } from './interactions/handler/on_view_error'
import { constants } from '../config/config'
import { RequestArgs } from '../utils/request'
import { Sentry } from '../utils/sentry'
import { handleDiscordinteraction } from './interactions/handler/handle_interaction'

export const authorize = (req: RequestArgs) => (request: Request) => {
  if (request.headers.get('Authorization') !== req.env.APP_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }
}

export const apiRouter = (app: App) =>
  Router({ base: '/api' })
    .get('/', () => {
      return new Response('API')
    })
    .all('*', (request) => {
      return new Response('Not found', { status: 404 })
    })

export const router = (req: RequestArgs, sentry: Sentry) =>
  Router()
    .get('/', () => {
      return new Response(`👀`)
    })

    .post('/interactions', (request) => {
      const app = new App(req, sentry)
      return handleDiscordinteraction(app, request)
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
      return new Response(`Deployed Leaderboards bot (${app.config.env.ENVIRONMENT})`)
    })

    .all('/api', async (request) => {
      const app = new App(req, sentry)
      return apiRouter(app).handle(request)
    })

    .post('/test', authorize(req), async () => {
      return await runTests()
    })

    .all('*', () => new Response('Not Found', { status: 404 }))
