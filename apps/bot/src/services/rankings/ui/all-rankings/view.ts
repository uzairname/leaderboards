import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import { AllRankingsHandlers } from '.'
import { App } from '../../../../setup/app'

export const all_rankings_view_sig = new ViewSignature({
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

export const all_rankings_view = all_rankings_view_sig.set<App>({
  onComponent: async (ctx, app) => ctx.state.get.handler()(app, ctx),
})
