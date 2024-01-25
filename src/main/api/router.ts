import { Router, json } from 'itty-router'
import { authorize } from '../../request/request'
import { sentry } from '../../request/sentry'
import { maxIndex, nonNullable } from '../../utils/utils'
import { App } from '../app/app'
import { Colors, relativeTimestamp } from '../messages/message_pieces'
import { leaderboardMessage } from '../modules/leaderboard/leaderboard_messages'
import { calculateMatchNewRatings } from '../modules/matches/scoring/score_matches'
import { getRegisterPlayer } from '../modules/players'
import { default_elo_settings } from '../modules/rankings/manage_rankings'
import { getCommands } from '../modules/view_manager/manage_views'

export const apiRouter = (app: App) =>
  Router({ base: '/api' })
    .get('/', async () => {
      return new Response('API')
    })
    .get('/commands', authorize(app.config.env), async request => {
      const result = {
        'defined global commands': getCommands(app, undefined),
      }
      return new Response(JSON.stringify(result), {
        headers: {
          'content-type': 'application/json',
        },
      })
    })
    .get('/endpoints', authorize(app.config.env), async request => {
      const result = {
        interactions: app.config.env.BASE_URL + '/interactions',
        linked_roles: app.config.env.BASE_URL + '/oauth' + app.config.OauthRoutes.LinkedRoles,
        oauth_redirect: app.config.env.BASE_URL + '/oauth' + app.config.OauthRoutes.Redirect
      }
    })
    .all('*', () => new Response('Not found', { status: 404 }))
