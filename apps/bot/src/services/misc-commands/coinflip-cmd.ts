import { CommandView } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { AppView, GuildCommand } from '../../classes/ViewModule'

export const coinflip_cmd_config = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  name: 'coinflip',
  description: 'Choose left or right',
})

export default new GuildCommand(coinflip_cmd_config, async (app, guild) => {

    if (guild.data.id !== '1264804225804668981') return null
    return coinflip_cmd_config

  }, app =>
  coinflip_cmd_config.onCommand(async ctx => {
    const result = Math.random() < 0.5 ? 'left' : 'right'

    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `${result}\n-# (The order of players is randomized every match. You can use this to choose sides instead of /coinflip`,
      },
    }
  }),
)
