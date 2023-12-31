import {
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import { CommandView, ChoiceField } from '../../../discord-framework'

import { checkGuildInteraction } from '../checks'
import { checkInteractionMemberPerms } from '../checks'
import { getOrAddGuild, syncGuildAdminRole } from '../../modules/guilds'
import { AppErrors, UserErrors } from '../../errors'
import { App } from '../../app'

const settings_command = new CommandView({
  type: ApplicationCommandType.ChatInput,

  custom_id_prefix: 'settings',

  command: {
    name: 'settings',
    description: 'Settings',
  },

  state_schema: {
    page: new ChoiceField({
      'admin role': null,
    }),
  },
})

export default (app: App) =>
  settings_command
    .onCommand(async (ctx) => {
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: 'Create a role for bot admin permissions',
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  label: 'create admin role',
                  style: ButtonStyle.Primary,
                  custom_id: ctx.state.set.page('admin role').encode(),
                },
              ],
            },
          ],
          flags: MessageFlags.Ephemeral,
        },
      }
    })

    .onComponent(async (ctx) => {
      const interaction = checkGuildInteraction(ctx.interaction)
      let guild = await getOrAddGuild(app, interaction.guild_id)

      if (ctx.state.is.page('admin role')) {
        await checkInteractionMemberPerms(app, ctx)
        const role_result = await syncGuildAdminRole(app, guild)
        await app.bot.addRoleToMember(
          interaction.guild_id,
          interaction.member.user.id,
          role_result.role.id,
        )

        return {
          type: InteractionResponseType.UpdateMessage,
          data: {
            content: `<@&${role_result.role.id}> has bot admin permissions. You can edit and assign it as you like`,
          },
        }
      } else {
        throw new AppErrors.UnknownState(ctx.state.data.page)
      }
    })
