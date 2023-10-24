import { Router } from 'itty-router'
import { App } from '../app'

export const apiRouter = (app: App) =>
  Router({ base: '/api' })
    .get('/', () => {
      return new Response('API')
    })
    .all('*', (request) => {
      return new Response('Not found', { status: 404 })
    })
