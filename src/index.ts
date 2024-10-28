import { Router } from 'itty-router'
import { initSentry, sentry } from './logging/sentry'
import { apiRouter } from './main/api/api_router'
import { authorize } from './main/api/authorize'
import { oauthRouter } from './main/api/oauth'
import { updateRouter } from './main/api/update_app'
import initApp from './main/initApp'
import { runTests } from './main/test/test'

export default {
  fetch(request: Request, env: Env, execution_context: ExecutionContext) {
    initSentry(request, env, execution_context)

    const app = initApp(env)

    const router = Router()
      .post('/interactions', request => app.handleInteractionRequest(request))

      .get(`/oauth/*`, request => oauthRouter(app).handle(request))

      .all('/api/*', request => apiRouter(app).handle(request))

      .post('/update/*', authorize(env), request => updateRouter(app).handle(request))

      .all('/test/*', () => runTests(app))

      .get('*', () => new Response(`👀`))

      .all('*', () => new Response('Not Found', { status: 404 }))

    return sentry.withLogging(router.handle)
  },
}

export interface Env {
  ENVIRONMENT: string
  BASE_URL: string
  DISCORD_TOKEN: string
  PUBLIC_KEY: string
  APPLICATION_ID: string
  CLIENT_SECRET: string
  SENTRY_DSN: string
  APP_KEY: string
  POSTGRES_URL: string
}
