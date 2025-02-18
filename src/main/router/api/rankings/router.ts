import { json, Router } from 'itty-router'
import { Ranking } from '../../../../database/models'
import { nonNullable } from '../../../../utils/utils'
import { App } from '../../../app/App'
import {
  leaderboardMessage,
  syncRankingLbMessages,
} from '../../../bot/modules/leaderboard/leaderboard-message'
import { rescoreMatches } from '../../../bot/modules/matches/management/manage-matches'
import { MatchConfigSchema } from '../../../../database/models/rankings'
import { object } from 'zod'

export default (app: App, ranking: Ranking) =>
  Router({ base: `/api/rankings/${ranking.data.id}` })

    .get('/lb-message', async request => {
      const str = (await leaderboardMessage(app, ranking)).embeds![0].description
      return new Response(str)
    })

    .post('/refresh-lb', async request => {
      await syncRankingLbMessages(app, ranking)
      return new Response(`Updated ${ranking.data.name} leaderboards`)
    })

    .post('/rescore', async request => {
      const result = await rescoreMatches(app, ranking, {
        reset_rating_to_initial: true,
      })
      return json(result.map(m => ({ player: m.player.data.id, rating: m.rating })))
    })

    .post('/update-match-config', async request => {
        const body = await request.json()
        if (!(body instanceof Object && body.hasOwnProperty('match_config'))) return new Response(`match_config not in body`, { status: 400 })
        const match_config = MatchConfigSchema.safeParse((body as any).match_config)
        if (!match_config.success) {
          return new Response('Invalid match_config', { status: 400 })
        }
        await ranking.update({ match_config: match_config.data })

        return new Response(`Updated match config for ${ranking.data.name} leaderboard`)
    })
