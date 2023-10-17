import { Router } from 'itty-router'

export const initAPIRouter = () =>
  Router({ base: '/api' })
    .get('/', () => {
      return new Response('API')
    })
    .all('*', (request) => {
      return new Response(null, { status: 404 })
    })
