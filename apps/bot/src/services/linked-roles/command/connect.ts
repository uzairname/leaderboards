import { CommandSignature } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'

export const connect_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'connect',
  description: `Connect your account to a ranking to display on your profile`,
  custom_id_prefix: 'c',
})

export const connect_cmd = connect_cmd_sig.set<App>({
  guildSignature: () => connect_cmd,
  onCommand: async ctx => {
    return ctx.defer(async ctx => {
      await ctx.edit({
        content: `test`,
      })
    })
  },
})
