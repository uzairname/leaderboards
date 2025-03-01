import { MatchSettingsSchema, Ranking } from '@repo/db/models'
import { json, Router } from 'itty-router'
import { syncRankingLbMessages } from '../../services/leaderboard/manage'
import { leaderboardMessage } from '../../services/leaderboard/ui/pages'
import { rescoreAllMatches } from '../../services/matches/scoring/score_match'
import { App } from '../../setup/app'

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
      const result = await rescoreAllMatches(app, ranking)
      return json(result.map(m => ({ player: m.player.data.id, rating: m.rating })))
    })

    .post('/update-match-config', async request => {
      const body = await request.json()
      if (!(body instanceof Object && body.hasOwnProperty('match_config')))
        return new Response(`match_config not in body`, { status: 400 })
      const match_settings = MatchSettingsSchema.safeParse((body as any).match_config)
      if (!match_settings.success) {
        return new Response('Invalid match_config', { status: 400 })
      }
      await ranking.update({ match_settings: match_settings.data })

      return new Response(`Updated match config for ${ranking.data.name} leaderboard`)
    })
