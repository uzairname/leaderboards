import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import { App } from '../../../setup/app'
import * as RankingSettingsHandlers from './handlers'

export const ranking_settings_view_sig = new ViewSignature({
  name: 'ranking settings',
  custom_id_prefix: 'rs',
  state_schema: {
    ranking_id: field.Int(),
    handler: field.Choice(RankingSettingsHandlers),
    setting_key: field.String(),
    selected_role_id: field.String(),
  },
  guild_only: true,
})

export const ranking_settings_view = ranking_settings_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return (ctx.state.data.handler ?? RankingSettingsHandlers.sendMainPage)(app, ctx)
  },
})
