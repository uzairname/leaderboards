import { json, Router } from 'itty-router'
import views from '../bot/manage-views/all_views'
import { App } from '../context/app_context'

export const apiRouter = (app: App) =>
  Router({ base: '/api' })
    .get('/', async () => {
      return new Response('API')
    })
    .get('/commands', () => {
      const result = {
        'defined commands': views.all_views
          .map(c => {
            return {
              cid_prefix: `${c.base_signature.signature.custom_id_prefix}`,
              name: `${c.base_signature.signature.name}`,
              is_guild_command: !!c.resolveGuildSignature,
              experimental: c.is_dev,
            }
          })
          .sort((a, b) => {
            // first by experimental, then by cid_prefix
            if (a.experimental && !b.experimental) return -1
            if (!a.experimental && b.experimental) return 1
            return a.cid_prefix.localeCompare(b.cid_prefix)
          }),
      }
      // format json
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
