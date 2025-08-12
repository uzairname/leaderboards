import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import { App } from '../../../setup/app'
import { leaderboardPage } from './pages'

export const leaderboard_view_sig = new ViewSignature({
  custom_id_prefix: 'lb',
  state_schema: {
    ranking_id: field.Int(),
    page: field.Int(),
    max_page: field.Int(),
    clicked_nav_btn: field.Enum({
      start: null,
      prev: null,
      next: null,
      end: null,
    }),
  },
})

export const leaderboard_view = leaderboard_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return ctx.defer(async ctx => {
      const current_page = ctx.state.get.page()

      const new_page = {
        start: 1,
        prev: current_page - 1,
        next: current_page + 1,
        end: ctx.state.get.max_page(),
      }[ctx.state.get.clicked_nav_btn()]

      ctx.state.save.page(new_page)

      await ctx.edit(await leaderboardPage(app, ctx))
    })
  },
})
