import * as D from 'discord-api-types/v10'
import { UserError } from '../../../bot/errors/UserError'

export function checkDmInteraction<T extends D.APIBaseInteraction<any, any>>(
  interaction: T,
): D.APIDMInteractionWrapper<T> {
  if (!D.Utils.isDMInteraction(interaction)) {
    throw new UserError('Use this in a DM')
  }
  return interaction as D.APIDMInteractionWrapper<T>
}

export function checkGuildInteraction<T extends D.APIBaseInteraction<any, any>>(
  interaction: T,
): D.APIGuildInteractionWrapper<T> {
  if (!D.Utils.isGuildInteraction(interaction)) {
    throw new UserError('Use this in a server')
  }
  return interaction as D.APIGuildInteractionWrapper<T>
}

export function checkGuildMessageComponentInteraction<T extends D.APIBaseInteraction<any, any>>(
  interaction: T,
): D.APIMessageComponentGuildInteraction {
  if (
    !D.Utils.isMessageComponentInteraction(interaction) ||
    !D.Utils.isMessageComponentGuildInteraction(interaction)
  ) {
    throw new Error(`Use this in a server`)
  }
  return interaction
}

export function checkMessageComponentInteraction<T extends D.APIBaseInteraction<any, any>>(
  interaction: T,
): D.APIMessageComponentInteraction {
  if (!D.Utils.isMessageComponentInteraction(interaction)) {
    throw new Error(`Expected a component interaction`)
  }
  return interaction
}
