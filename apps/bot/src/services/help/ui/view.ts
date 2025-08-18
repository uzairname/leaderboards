import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { HelpPages } from '.'
import { App } from '../../../setup/app'

export const help_view_sig = new ViewSignature({
  custom_id_prefix: 'h',
  state_schema: {
    page: field.Choice(HelpPages),
    followup: field.Boolean(),
  },
})

export const help_view = help_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    // Send or edit the message based on what state the caller specified.
    const followup = ctx.state.is.followup()
    // If we're already on the help view, we want to edit the message.
    ctx.state.save.followup(false)

    const msg = await (ctx.state.data.page ?? HelpPages.overviewPage)(app, ctx)

    return ctx.defer(
      async ctx => void (await (followup ? ctx.followup : ctx.edit)(msg.ephemeral().response_data)),
    )
  },
})
