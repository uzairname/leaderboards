import * as D from 'discord-api-types/v10'
import { nonNullable } from '../../../utils/utils'
import { ComponentInteraction } from '../types'

export function getModalSubmitEntries(
  interaction: D.APIModalSubmitInteraction
): D.ModalSubmitComponent[] {
  return interaction.data.components
    .map(row => {
      return row.components
    })
    .flat()
}
