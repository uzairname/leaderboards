import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import { RankingSettingsHandlers, RankingSettingsPages } from '.'
import { App } from '../../../../setup/app'

export const ranking_settings_view_sig = new ViewSignature({
  name: 'ranking settings',
  custom_id_prefix: 'rs',
  state_schema: {
    ranking_id: field.Int(),
    handler: field.Choice(RankingSettingsHandlers),
    page: field.Choice(RankingSettingsPages),
  },
  guild_only: true,
})

export const ranking_settings_view = ranking_settings_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return ctx.state.get.handler()(app, ctx)
  },
})
