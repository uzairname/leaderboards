import { Router } from 'itty-router'
import { OAuth2Scopes } from 'discord-api-types/v10'

import { App } from './app'
import { deployBot } from './modules/deploy_bot'
import { oauthRedirect, oauthCallback } from './modules/oauth'
import { runTests } from './test/test'
import { handleInteraction } from './views/all_views'
import { config } from '../utils/globals'
import { initAPIRouter } from './api/router'

export function authorize(request: Request) {
  if (request.headers.get('Authorization') !== config.env.APP_KEY) {
    return new Response(null, { status: 403 })
  }
}

export const router = () =>
  Router()
    .get('/', async () => {
      return new Response(`👀`)
    })

    .post('/interactions', (request) => {
      return handleInteraction(new App(), request)
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
      return initAPIRouter().handle(request)
    })

    .post('/test', authorize, async () => {
      await runTests()
    })

    .all('*', () => new Response(null, { status: 404 }))
