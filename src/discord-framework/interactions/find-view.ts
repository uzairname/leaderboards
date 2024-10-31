import * as D from 'discord-api-types/v10'
import { ViewErrors } from './errors'
import { AnyView, FindViewCallback } from './types'

export function findView(
  findViewCallback: FindViewCallback,
  command_interaction?:
    | D.APIApplicationCommandInteraction
    | D.APIApplicationCommandAutocompleteInteraction,
  custom_id_prefix?: string,
): AnyView {
  const view = findViewCallback(
    command_interaction
      ? { name: command_interaction.data.name, type: command_interaction.data.type }
      : undefined,
    custom_id_prefix,
  )
  if (!view) throw new ViewErrors.UnknownView()
  return view
}
