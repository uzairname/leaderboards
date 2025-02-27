import { CommandSignature } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { help_view_sig } from './help-view'
import { HelpPages } from './help-view-handlers'

export const help_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'help',
  description: 'All about this bot',
})

export const help_cmd = help_cmd_sig.set<App>({
  onCommand: async (ctx, app) => {
    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: await HelpPages.overviewPage(app, {
        ...ctx,
        state: help_view_sig.newState({
          page: HelpPages.overviewPage,
        }),
      }),
    }
  },
})
