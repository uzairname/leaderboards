import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import { App } from '../../../../setup/app'
import { AllRankingsHandlers } from './handlers'

export const rankings_view_sig = new ViewSignature({
  custom_id_prefix: 's',
  name: 'settings page',
  state_schema: {
    handler: field.Choice(AllRankingsHandlers),
    modal_input: field.Object({
      name: field.String(),
      teams_per_match: field.Int(),
      players_per_team: field.Int(),
      best_of: field.Int(),
    }),
  },
  guild_only: true,
})

export const sig = new ViewSignature({
  custom_id_prefix: 's',
  name: 'settings page',
  guild_only: true,
  state_schema: {
    a: field.String(),
  },
})

export const rankings_view = rankings_view_sig.set<App>({
  onComponent: async (ctx, app) => ctx.state.get.handler()(app, ctx),
})
