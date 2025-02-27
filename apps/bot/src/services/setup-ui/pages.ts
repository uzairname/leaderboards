import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'
import { SetupHandlers } from './handlers'
import { setup_view_sig } from './view'

export namespace SetupPages {
  export async function start(app: App): Promise<D.APIInteractionResponseCallbackData> {
    return {
      embeds: [
        {
          title: `Welcome`,
          description: `This walkthrough will help you set up the bot in your server.`,
          color: 0x00ff00,
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
    }
  }
}
