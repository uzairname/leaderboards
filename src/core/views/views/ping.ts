import { ApplicationCommandType, InteractionResponseType } from 'discord-api-types/v10'
import { CommandView } from '../../../discord/views/views'
import { App } from '../../app'

export default (app: App) =>
  new CommandView({
    type: ApplicationCommandType.ChatInput,
    command: {
      name: 'ping',
      description: 'ping ping',
    },
    state_schema: {},
  }).onCommand(async (ctx) => {
    //
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `<@${ctx.interaction.member?.user.id ?? ctx.interaction.user?.id}>`,
        flags: 64,
        allowed_mentions: {
          parse: [],
        },
      },
    }
  })
