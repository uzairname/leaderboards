import * as D from 'discord-api-types/v10'
import { InteractionErrors } from './errors'
import { AnyView, FindViewCallback } from './types'


/**
 * Runs findViewCallback, and throws an error if no view is found.
 * @param findViewCallback A callback that takes a custom id prefix and a command interaction,
 * and returns the view that matches it.
 * @returns The view that matches the command interaction.
 */
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
  if (!view) throw new InteractionErrors.UnknownView()
  return view
}
