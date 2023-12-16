import { APIModalSubmitInteraction, ModalSubmitComponent } from 'discord-api-types/v10'

export function getModalSubmitEntries(
  interaction: APIModalSubmitInteraction,
): ModalSubmitComponent[] {
  return interaction.data.components
    .map((row) => {
      return row.components
    })
    .flat()
}
