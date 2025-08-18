import { IttyRouter } from 'itty-router/IttyRouter'
import { Env } from '../Env'
import { App, handleInteractionRequest } from '../setup/app'
import apiRouter from './api'
import oauthRouter from './oauth'
import updateRouter from './update'

export default (app: App) =>
  IttyRouter()
    .post('/interactions', request => handleInteractionRequest(app, request))

    .get(`/oauth/*`, request => oauthRouter(app).fetch(request))

    .all('/api/*', request => apiRouter(app).fetch(request))

    .post('/update/*', authorize(app.env), request => updateRouter(app).fetch(request))

    .get('*', () => new Response(`👀`))

    .all('*', () => new Response('Not Found', { status: 404 }))

export const authorize = (env: Env) => (request: Request) => {
  if (request.headers.get('Authorization') !== env.APP_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }
}
