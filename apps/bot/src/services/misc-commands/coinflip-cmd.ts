import { CommandSignature } from '@repo/discord'
import * as D from 'discord-api-types/v10'

export const coinflip_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'coinflip',
  description: 'Choose left or right',
})

export const coinflip_cmd = coinflip_cmd_sig.set({
  guildSignature: async (app, guild_id) => (guild_id === '1264804225804668981' ? coinflip_cmd_sig : null),
  onCommand: async () => {
    const result = Math.random() < 0.5 ? 'left' : 'right'
    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `${result}`,
      },
    }
  },
})
