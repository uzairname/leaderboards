import { json, Router } from 'itty-router'
import { App } from '../app-context/app-context'
import { getAllCommandSignatures } from '../bot/view_manager/manage_views'

export const apiRouter = (app: App) =>
  Router({ base: '/api' })
    .get('/', async () => {
      return new Response('API')
    })
    .get('/commands', async request => {
      const result = {
        'defined global commands': getAllCommandSignatures(app, undefined),
      }
      return json(result)
    })
    .get('/endpoints', async request => {
      const result = {
        interactions: app.config.env.BASE_URL + '/interactions',
        linked_roles: app.config.env.BASE_URL + '/oauth' + app.config.OauthRoutes.LinkedRoles,
        oauth_redirect: app.config.env.BASE_URL + '/oauth' + app.config.OauthRoutes.Redirect,
      }
      return json(result)
    })
    .all('*', () => new Response('Not found', { status: 404 }))
