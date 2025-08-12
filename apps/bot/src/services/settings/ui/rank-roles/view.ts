import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import { RankRolesSettingsHandlers, RankRolesSettingsPages } from '.'
import { App } from '../../../../setup/app'

export const rank_roles_settings_view_sig = new ViewSignature({
  name: 'rank roles settings',
  custom_id_prefix: 'rr',
  state_schema: {
    ranking_id: field.Int(),
    handler: field.Choice(RankRolesSettingsHandlers),
    page: field.Choice(RankRolesSettingsPages),
    selected_role_id: field.String(),
  },
  guild_only: true,
})

export const rank_roles_settings_view = rank_roles_settings_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return ctx.state.get.handler()(app, ctx)
  },
})
