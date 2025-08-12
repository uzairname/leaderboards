import { CommandSignature } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { SetupPages } from '.'
import { App } from '../../setup/app'
import { ensureAdminPerms } from '../../utils/perms'

export const setup_cmd = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'setup',
  description: 'Set up the bot in this server',
  experimental: true,
}).set<App>({
  onCommand: async (ctx, app) => {
    ensureAdminPerms(app, ctx)

    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: await SetupPages.start(app),
    }
  },
})
