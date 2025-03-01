import * as D from 'discord-api-types/v10'
import { InteractionErrors } from '../errors'
import { CommandInteraction } from '../types'

/**
 * Checks if the interaction is
 */
export function isCommandInteraction(
  interaction: D.APIApplicationCommandInteraction,
): interaction is CommandInteraction {
  return (
    D.Utils.isChatInputApplicationCommandInteraction(interaction) ||
    D.Utils.isContextMenuApplicationCommandInteraction(interaction)
  )
}

export function checkDmInteraction<T extends D.APIBaseInteraction<any, any>>(
  interaction: T,
): D.APIDMInteractionWrapper<T> {
  if (!D.Utils.isDMInteraction(interaction)) {
    throw new InteractionErrors.WrongContext('Use this in a DM')
  }
  return interaction as D.APIDMInteractionWrapper<T>
}

export function checkGuildInteraction<T extends D.APIBaseInteraction<any, any>>(
  interaction: T,
): D.APIGuildInteractionWrapper<T> {
  if (!D.Utils.isGuildInteraction(interaction)) {
    throw new InteractionErrors.WrongContext('Use this in a server')
  }
  return interaction as D.APIGuildInteractionWrapper<T>
}

export function checkGuildMessageComponentInteraction<T extends D.APIBaseInteraction<any, any>>(
  interaction: T,
): D.APIMessageComponentGuildInteraction {
  if (!D.Utils.isMessageComponentInteraction(interaction) || !D.Utils.isMessageComponentGuildInteraction(interaction)) {
    throw new InteractionErrors.WrongContext(`Use this in a server`)
  }
  return interaction
}

export function checkMessageComponentInteraction<T extends D.APIBaseInteraction<any, any>>(
  interaction: T,
): D.APIMessageComponentInteraction {
  if (!D.Utils.isMessageComponentInteraction(interaction)) {
    throw new InteractionErrors.WrongContext(`Expected a component interaction`)
  }
  return interaction
}
