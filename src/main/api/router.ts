import { Router, json } from 'itty-router'
import { authorize } from '../../request/request'
import { sentry } from '../../request/sentry'
import { App } from '../app/app'
import { leaderboardMessage } from '../modules/leaderboard/leaderboard_messages'
import { getCommands } from '../modules/view_manager/manage_views'

export const apiRouter = (app: App) =>
  Router({ base: '/api' })
    .get('/', async () => {
      return new Response('API')
    })
    .get('/leaderboard/:ranking_id', async request => {
      const result = (
        await leaderboardMessage(await app.db.rankings.get(parseInt(request.params.ranking_id)))
      ).postdata
      return json(result)
    })
    .get('/commands/:guild_id?', async request => {
      if (authorize(app.config.env)(request)) return authorize(app.config.env)(request)

      const result = {
        'global commands': (await getCommands(app, undefined)).map(c => c.options.name),
        'guild commands': (await getCommands(app, request.params.guild_id)).map(
          c => c.options.name,
        ),
      }
      return json(result)
    })
    .get('/matches/:ranking_id', async request => {
      const ranking_id = parseInt(request.params.ranking_id)
      const matches = await app.db.matches.getMany({
        ranking_ids: [ranking_id],
      })

      return json(matches.map(m => ({
        teams: m.teams.map(t => t.map(p => p.player.data.id )),
        outcome: m.match.data.outcome
      })))
    })
    .get('/endpoints', authorize(app.config.env), async request => {
      const result = {
        interactions: app.config.env.BASE_URL + '/interactions',
        linked_roles: app.config.env.BASE_URL + '/oauth' + app.config.OauthRoutes.LinkedRoles,
        oauth_redirect: app.config.env.BASE_URL + '/oauth' + app.config.OauthRoutes.Redirect,
      }
      return json(result)
    })
    .all('*', () => new Response('Not found', { status: 404 }))
