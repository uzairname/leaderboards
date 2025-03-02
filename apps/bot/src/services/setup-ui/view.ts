import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import { SetupHandlers } from '.'
import { App } from '../../setup/app'

export const admin_role_method_options = {
  new: 'new',
  choose: 'choose',
  unset: 'unset',
}

export const setup_view_sig = new ViewSignature({
  custom_id_prefix: 'setup',
  state_schema: {
    handler: field.Choice(SetupHandlers),
    admin_role_method: field.Enum(admin_role_method_options),
  },
})

export const setup_view = setup_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return ctx.state.get.handler()(app, ctx)
  },
})
