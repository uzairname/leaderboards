import * as D from 'discord-api-types/v10'

export function getModalSubmitEntries(interaction: D.APIModalSubmitInteraction): {
  [k: string]: { value: string; type: D.ComponentType } | undefined
} {
  return Object.fromEntries(
    interaction.data.components
      .map(row => {
        return row.components
      })
      .flat()
      .map(c => [c.custom_id, { value: c.value, type: c.type }]),
  )
}
