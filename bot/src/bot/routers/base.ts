import { Router } from 'itty-router'
import { Env } from '../../Env'
import { App } from '../setup/app'
import apiRouter from './api'
import oauthRouter from './oauth'
import updateRouter from './update'

export default (app: App) =>
  Router()
    .post('/interactions', request => app.handleInteractionRequest(request))

    .get(`/oauth/*`, request => oauthRouter(app).handle(request))

    .all('/api/*', authorize(app.env), request => apiRouter(app).handle(request))

    .post('/update/*', authorize(app.env), request => updateRouter(app).handle(request))

    .get('*', () => new Response(`👀`))

    .all('*', () => new Response('Not Found', { status: 404 }))

export const authorize = (env: Env) => (request: Request) => {
  if (request.headers.get('Authorization') !== env.APP_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }
}
