import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import { App } from '../../setup/app'
import { leaderboardPage } from './pages'

export const leaderboard_view_sig = new ViewSignature({
  custom_id_prefix: 'lb',
  state_schema: {
    ranking_id: field.Int(),
    page_idx: field.Int(),
    max_page: field.Int(),
    id: field.Int(), // to have unique custom id for some buttons
  },
})

export const leaderboard_view = leaderboard_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return ctx.defer(async ctx => {
      await ctx.edit(await leaderboardPage(app, ctx))
    })
  },
})
