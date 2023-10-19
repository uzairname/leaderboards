import { Router } from 'itty-router'

export const apiRouter = () =>
  Router({ base: '/api' })
    .get('/', () => {
      return new Response('API')
    })
    .all('*', (request) => {
      return new Response('Not found', { status: 404 })
    })
