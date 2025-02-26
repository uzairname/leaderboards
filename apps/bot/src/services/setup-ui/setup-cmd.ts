import { CommandSignature } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'
import { Colors } from '../../utils'
import { ensureAdminPerms } from '../../utils/perms'
import { adminRolePage } from './setup-handlers'
import { setup_view_sig } from './setup-view'

export const admin_role_method_options = {
  new: 'new',
  choose: 'choose',
  unset: 'unset',
}

export const setup_cmd = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'setup',
  description: 'Set up the bot in this server',
}).set<App>({
  onCommand: async (ctx, app) => {
    ensureAdminPerms(app, ctx)

    const ctx2 = {
      ...ctx,
      state: setup_view_sig.newState(),
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
                custom_id: ctx2.state.set.callback(adminRolePage).cId(),
              },
            ],
          },
        ],
      },
    }
  },
})
