import { MatchSettingsSchema, Ranking, RatingRolesSchema } from '@repo/db/models'
import { strOrUndefined } from '@repo/utils'
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

    .post('/update_match_config', async request => {
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

    .post('/:guild_id/rating_roles', async request => {
      const guild_id = strOrUndefined(request.params.guild_id)
      if (!guild_id) return new Response(`Invalid guild_id`, { status: 400 })
      const { guild, guild_ranking } = await app.db.guild_rankings.fetchBy({
        guild_id,
        ranking_id: ranking.data.id,
      })
      const body = await request.json()
      if (!(body instanceof Object && body.hasOwnProperty('rating_roles')))
        return new Response(`rating_roles not in body`, { status: 400 })
      const rating_roles = RatingRolesSchema.safeParse((body as any).rating_roles)
      if (!rating_roles.success) {
        return new Response('Invalid rating_roles', { status: 400 })
      }
      await guild_ranking.update({ rating_roles: rating_roles.data })

      return new Response(`Updated rating roles for ranking ${ranking.data.name}, in guild ${guild.data.name}`)
    })
