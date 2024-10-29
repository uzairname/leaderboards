import { json, Router } from 'itty-router'
import { App } from '../app/App'
import { GuildCommand } from '../app/ViewModule'
import { inviteUrl } from '../bot/helpers/strings'
import views from '../bot/modules/all_views'

export const apiRouter = (app: App) =>
  Router({ base: '/api' })
    .get('/', async () => {
      return new Response('API')
    })
    .get('/commands', async () => {
      const result = {
        'defined commands': views.all_views
          .map(c => {
            return {
              cid_prefix: `${c.base_signature.signature.custom_id_prefix}`,
              name: `${c.base_signature.signature.name}`,
              is_guild_command: c instanceof GuildCommand,
              experimental: c.is_dev,
            }
          })
          .sort((a, b) => {
            return (
              (a.experimental ? 2 : 0) -
              (b.experimental ? 2 : 0) +
              a.cid_prefix.localeCompare(b.cid_prefix)
            )
          }),
        'global discord commands': (await app.discord.getAppCommands()).map(c => c.name),
      }
      // format json
      return json(result)
    })
    .get('/commands/:guild_id', async request => {
      const guild_id = request.params.guild_id
      const result = {
        'guild commands': (await app.discord.getAppCommands(guild_id)).map(c => c.name),
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
    .get('/invite-url', async () => new Response(inviteUrl(app)))
    .all('*', () => new Response('Not found', { status: 404 }))
