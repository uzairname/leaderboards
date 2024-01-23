import * as D from 'discord-api-types/v10'
import { sentry } from '../../request/sentry'
import { AnyView, FindViewCallback } from './types'
import { ViewErrors } from './utils/errors'

export async function findView_(
  findView: FindViewCallback,
  command_interaction?:
    | D.APIApplicationCommandInteraction
    | D.APIApplicationCommandAutocompleteInteraction,
  custom_id_prefix?: string,
): Promise<AnyView> {
  sentry.addBreadcrumb({
    message: 'Received Interaction',
    category: 'discord',
    level: 'info',
    data: {
      command_interaction: {
        name: command_interaction?.data.name,
        type: command_interaction?.data.type,
        guild_id: command_interaction?.data.guild_id,
      },
      custom_id_prefix,
    },
  })

  const view = await findView(
    command_interaction
      ? {
          name: command_interaction.data.name,
          type: command_interaction.data.type,
          guild_id: command_interaction.data.guild_id,
        }
      : undefined,
    custom_id_prefix,
  )
  if (!view) throw new ViewErrors.UnknownView()
  return view
}
