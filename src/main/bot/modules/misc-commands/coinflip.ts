import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../discord-framework'
import { AppView } from '../../../app/ViewModule'

export const coinflip_cmd_config = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'coinflip',
  description: 'Choose left or right',
})

export default new AppView(coinflip_cmd_config, app =>
  coinflip_cmd_config.onCommand(async ctx => {
    const result = Math.random() < 0.5 ? 'left' : 'right'
    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `${result}`,
      },
    }
  }),
)
