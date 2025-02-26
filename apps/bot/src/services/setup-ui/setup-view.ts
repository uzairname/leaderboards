import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'
import { rankingsPage } from '../rankings/ui/rankings-view'
import { admin_role_method_options } from './setup-cmd'
import * as handlers from './setup-handlers'

export const setup_view_sig = new ViewSignature({
  custom_id_prefix: 'setup',
  state_schema: {
    callback: field.Choice({
      ...handlers,
      rankingsPage,
    }),
    admin_role_method: field.Enum(admin_role_method_options),
  },
})

export const setup_view = setup_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: await ctx.state.get.callback()(app, ctx),
    }
  },
})
