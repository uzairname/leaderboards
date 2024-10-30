import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../discord-framework'
import { AppView } from '../../../../../app/ViewModule'

export const dev_cmd_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'dev',
  description: 'Test command',
  options: [
    {
      type: D.ApplicationCommandOptionType.Subcommand,
      name: 'clear-cache',
      description: 'Clear cache',
    },
  ],
})

export default new AppView(dev_cmd_signature, app =>
  dev_cmd_signature.onCommand(async ctx => {
    const subcommand_options = ctx.interaction.data
      .options as D.APIApplicationCommandInteractionDataSubcommandOption[]

    const subcommand_option_name = subcommand_options[0].name

    switch (subcommand_option_name) {
      case 'clear-cache':
        app.db.cache.clear()
        return {
          type: D.InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `cleared cache`,
          },
        }
    }

    throw new Error('Unknown subcommand')
  }),
)
