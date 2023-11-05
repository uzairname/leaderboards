import { ApplicationCommandType, InteractionResponseType } from "discord-api-types/v10";
import { CommandView } from "../../../discord";

const ping_command = new CommandView({
  type: ApplicationCommandType.ChatInput,

  command: {
    name: 'ping',
    description: 'ping ping',
  },

  state_schema: {},
})

export default ping_command.onCommand(async (ctx) => {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: 'pong',
    }
  }
})