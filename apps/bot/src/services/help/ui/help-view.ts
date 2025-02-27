import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { HelpPages } from './help-view-handlers'

export const help_view_sig = new ViewSignature({
  custom_id_prefix: 'h',
  state_schema: {
    page: field.Choice(HelpPages),
  },
})

export const help_view = help_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: await ctx.state.get.page()(app, ctx),
    }
  },
})
