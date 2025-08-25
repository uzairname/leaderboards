import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import { App } from '../../../setup/app'
import * as handlers from './pages'

export const player_view_sig = new ViewSignature({
  name: 'Manage Player',
  custom_id_prefix: 'p',
  state_schema: {
    user_id: field.String(),
    players: field.Array(
      field.Object({
        id: field.Int(),
        ranking_id: field.Int(),
      }),
    ),
    page: field.Choice(handlers),
    confirm_remove: field.Bool(),
  },
  guild_only: true,
})

export const player_view = player_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return ctx.defer(async ctx => {
      await ctx.edit((await ctx.state.get.page()(app, ctx)).response_data)
    })
  },
})
