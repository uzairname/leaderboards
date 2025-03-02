import { appCommandToJSONBody, isCommandHandler } from '@repo/discord'
import { intOrUndefined } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { json, Router } from 'itty-router'
import { App } from '../setup/app'
import { initInteractionHandler } from '../setup/interaction-handler'
import { inviteUrl } from '../utils/'
import rankingsRouter from './api/rankings'
import { authorize } from './base'
import { getUserAccessToken, saveUserAccessToken } from './oauth'

export default (app: App) =>
  Router({ base: '/api' })
    .get('/', async () => {
      return new Response('API')
    })

    .post('*', authorize(app.env))

    .get('/endpoints', async request => {
      const result = {
        interactions: app.config.env.BASE_URL + '/interactions',
        linked_roles: app.config.env.BASE_URL + '/oauth' + app.config.OauthRoutes.LinkedRoles,
        oauth_redirect: app.config.env.BASE_URL + '/oauth' + app.config.OauthRoutes.Redirect,
      }
      return json(result)
    })

    .get('/handlers', async () => {
      const result = {
        'defined view and command handlers': initInteractionHandler()
          .all_handlers.map(c => {
            return {
              cid_prefix: `${c.signature.config.custom_id_prefix}`,
              name: `${c.signature.config.name}`,
              is_guild_command: !!(isCommandHandler(c) && c.guildSignature),
              experimental: c.signature.config.experimental,
            }
          })
          .sort((a, b) => {
            return (a.experimental ? 2 : 0) - (b.experimental ? 2 : 0) + a.cid_prefix.localeCompare(b.cid_prefix)
          }),
        'global discord commands': (await app.discord.getAppCommands()).map(c => c.name),
      }

      return json(result)
    })

    .get('/commands/:guild_id', async request => {
      app.db.cache.clear()
      const guild_id = request.params.guild_id

      const commands = await app.view_manager.commandSignatures({
        arg: app,
        guild_id: guild_id,
        include_experimental: app.config.features.ExperimentalCommands,
      })

      const commands_data = commands.map(appCommandToJSONBody)
      const query = {
        route: D.Routes.applicationGuildCommands(app.discord.application_id, guild_id),
        body: commands_data,
      }

      return json(query)
    })

    .get('/invite-url', async () => new Response(inviteUrl(app)))

    .all('/rankings/:ranking_id/*', async request => {
      const ranking_id = intOrUndefined(request.params.ranking_id)
      if (ranking_id === undefined) {
        return new Response('Invalid ranking_id', { status: 400 })
      }
      const ranking = await app.db.rankings.fetch(ranking_id)
      if (!ranking) {
        return new Response('Unknown ranking', { status: 404 })
      }
      return rankingsRouter(app, ranking).handle(request)
    })

    .post('/access-tokens', async request => {
      // save a user's access token to the database
      const body = await request.json()
      if (!body) {
        return new Response('Invalid body', { status: 400 })
      }

      await saveUserAccessToken(app, body as D.RESTPostOAuth2AccessTokenResult)

      return new Response('OK', { status: 200 })
    })

    .get('/access-tokens/:user_id', async request => {
      // retrieve a user's access token by user id
      const user_id = request.params.user_id
      if (!user_id) {
        return new Response('Missing user_id', { status: 400 })
      }

      const bearer_token = await getUserAccessToken(app, user_id)

      return json(bearer_token, { status: 200 }) // string | undefined
    })

    .all('*', () => new Response('Not found', { status: 404 }))
