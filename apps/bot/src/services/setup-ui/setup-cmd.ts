import { CommandSignature } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { SetupHandlers, SetupPages } from '.'
import { App } from '../../setup/app'
import { Colors } from '../../utils'
import { ensureAdminPerms } from '../../utils/perms'
import { setup_view_sig } from './view'

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

    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        embeds: [
          {
            title: `Welcome`,
            description: `This walkthrough will help you set up the bot in your server.`,
            color: Colors.EmbedBackground,
          },
        ],
        components: [
          {
            type: D.ComponentType.ActionRow,
            components: [
              {
                type: D.ComponentType.Button,
                label: 'Continue',
                style: D.ButtonStyle.Primary,
                custom_id: setup_view_sig.newState({ handler: SetupHandlers.sendAdminRolePage }).cId(),
              },
            ],
          },
        ],
        flags: D.MessageFlags.Ephemeral,
      },
    }
  },
})
