import * as D from 'discord-api-types/v10'
import { DiscordLogger } from '../../logging'

export function logInteraction(interaction: D.APIInteraction, logger?: DiscordLogger) {
  logger?.setUser({
    id: interaction.user?.id ?? interaction.member?.user.id,
    username: interaction.user?.username ?? interaction.member?.user.username,
    guild: interaction.guild_id,
  })

  const data: Record<string, unknown> = {}

  if (interaction.type === D.InteractionType.ApplicationCommand) {
    const options = D.Utils.isChatInputApplicationCommandInteraction(interaction) ? interaction.data.options : undefined

    data['command_interaction'] = {
      name: interaction.data.name,
      type: interaction.data.type,
      guild_id: interaction.guild_id,
      options: JSON.stringify(options),
    }
  }
}
