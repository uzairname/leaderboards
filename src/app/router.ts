import { Router } from 'itty-router'
import { OAuth2Scopes } from 'discord-api-types/v10'

import { respondToDiscordInteraction } from '../discord'
import { config } from '../utils/globals'

import { App } from './app'
import { apiRouter } from './api/router'
import { deployBot } from './modules/deploy_bot'
import { oauthRedirect, oauthCallback } from './modules/oauth'
import { runTests } from './test'
import { findView } from './interactions/all_views'
import { onInteractionError } from './interactions/on_interaction_error'

export function authorize(request: Request) {
  if (request.headers.get('Authorization') !== config.env.APP_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }
}

export const router = () =>
  Router()
    .get('/', () => {
      return new Response(`👀`)
    })

    .post('/interactions', (request) => {
      const app = new App()
      return respondToDiscordInteraction(
        app.bot,
        request,
        findView(app),
        onInteractionError(app),
        false,
      )
    })

    .get(config.routes.OAUTH_LINKED_ROLES, () => {
      return oauthRedirect(new App().bot, [
        OAuth2Scopes.Identify,
        OAuth2Scopes.RoleConnectionsWrite,
      ])
    })

    .get(config.routes.OAUTH_CALLBACK, (request) => {
      return oauthCallback(new App(), request)
    })

    .post('/init', authorize, async () => {
      await deployBot(new App())
      return new Response(`Deployed Firstplace bot (${config.env.ENVIRONMENT})`)
    })

    .all('/api', async (request) => {
      return apiRouter().handle(request)
    })

    .post('/test', async () => {
      return await runTests()
    })

    .all('*', () => new Response('Not Found', { status: 404 }))
