import * as D from 'discord-api-types/v10'
import { json, Router } from 'itty-router'
import { appCommandToJSONBody } from '../../../discord-framework'
import { App } from '../../app/App'
import { GuildCommand } from '../../app/ViewModule'
import views from '../../bot/modules/all-views'
import { inviteUrl } from '../../bot/ui-helpers/strings'
import rankingsRouter from './rankings/router'

export default (app: App) =>
  Router({ base: '/api' })
    .get('/', async () => {
      return new Response('API')
    })

    .get('/commands', async () => {
      const result = {
        'defined commands': views.all_views
          .map(c => {
            return {
              cid_prefix: `${c.base_signature.config.custom_id_prefix}`,
              name: `${c.base_signature.config.name}`,
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
      app.db.cache.clear()
      const guild_id = request.params.guild_id
      const guild = await app.db.guilds.get(guild_id)

      const commands = await app.views.getAllCommandSignatures(app, guild)

      const commands_data = commands.map(appCommandToJSONBody)
      const query = {
        route: D.Routes.applicationGuildCommands(app.discord.application_id, guild_id),
        body: commands_data,
      }

      return json(query)
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

    .all('/rankings/:ranking_id/*', async request => {
      const ranking_id = parseInt(request.params.ranking_id)
      if (isNaN(ranking_id)) {
        return new Response('Invalid ranking_id', { status: 400 })
      }
      const ranking = await app.db.rankings.fetch(ranking_id)
      if (!ranking) {
        return new Response('Unknown ranking', { status: 404 })
      }
      return rankingsRouter(app, ranking).handle(request)
    })

    .all('*', () => new Response('Not found', { status: 404 }))
