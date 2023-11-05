import { Router } from 'itty-router'
import { OAuth2Scopes } from 'discord-api-types/v10'

import { runTests } from '../../test/test'
import { Env } from '../utils/request'
import { App } from './app'
import { respondToDiscordInteraction } from '../discord'
import { oauthRedirect, oauthCallback } from './modules/oauth'
import { findView, syncDiscordCommands } from './interactions/app_interactions'
import { onViewError } from './interactions/utils/on_view_error'
import { constants } from './config/config'
import { syncAppRoleConnectionsMetadata } from './modules/linked_roles'

export const authorize = (env: Env) =>
  function (req: Request) {
    if (req.headers.get('Authorization') !== env.APP_KEY) {
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

export const router = (app: App) =>
  Router()
    .get('/', () => {
      return new Response(`👀`)
    })

    .post('/interactions', (request) => {
      return respondToDiscordInteraction(app.bot, request, findView(app), onViewError(app))
    })

    .get(constants.routes.OAUTH_LINKED_ROLES, () => {
      return oauthRedirect(app, [OAuth2Scopes.Identify, OAuth2Scopes.RoleConnectionsWrite])
    })

    .get(constants.routes.OAUTH_CALLBACK, (request) => {
      return oauthCallback(app, request)
    })

    .post('/init', authorize(app.config.env), async () => {
      await syncDiscordCommands(app)
      await syncAppRoleConnectionsMetadata(app)
      await app.db.settings.getOrUpdate({ last_deployed: new Date() })
      return new Response(`Deployed Leaderboards bot (${app.config.env.ENVIRONMENT})`)
    })

    .all('/api', async (request) => {
      return apiRouter(app).handle(request)
    })

    .post('/test', authorize(app.config.env), async () => {
      return await runTests()
    })

    .all('*', () => new Response('Not Found', { status: 404 }))
