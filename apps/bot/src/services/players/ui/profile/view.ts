import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import { ProfileHandlers } from '.'
import { App } from '../../../../setup/app'

export const profile_view_sig = new ViewSignature({
  name: 'Profile page',
  custom_id_prefix: 'p',
  state_schema: {
    handler: field.Choice(ProfileHandlers),
    user_id: field.String(),
    ranking_id: field.Int(),
    page: field.Enum({
      main: null,
      ranking: null,
    }),
  },
})

export const profile_view = profile_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return ctx.state.get.handler()(app, ctx)
  },
})
