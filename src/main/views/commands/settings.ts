import * as D from 'discord-api-types/v10'
import { ChoiceField, CommandView, _ } from '../../../discord-framework'
import { App } from '../../app/app'
import { AppErrors, UserErrors } from '../../app/errors'
import { getOrAddGuild, syncGuildAdminRole } from '../../modules/guilds'
import { checkGuildInteraction, ensureAdminPerms } from '../utils/checks'

const settings_cmd = new CommandView({
  type: D.ApplicationCommandType.ChatInput,

  custom_id_prefix: 'settings',

  command: {
    name: 'settings',
    description: 'Settings'
  },

  state_schema: {
    page: new ChoiceField({
      'admin role': _
    })
  }
})

export const settingsCmd = (app: App) =>
  settings_cmd
    .onCommand(async ctx => {
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: 'Create a role for bot admin permissions',
          components: [
            {
              type: D.ComponentType.ActionRow,
              components: [
                {
                  type: D.ComponentType.Button,
                  label: 'create admin role',
                  style: D.ButtonStyle.Primary,
                  custom_id: ctx.state.set.page('admin role').encode()
                }
              ]
            }
          ],
          flags: D.MessageFlags.Ephemeral
        }
      }
    })

    .onComponent(async ctx => {
      const interaction = checkGuildInteraction(ctx.interaction)
      let guild = await getOrAddGuild(app, interaction.guild_id)

      if (ctx.state.is.page('admin role')) {
        await ensureAdminPerms(app, ctx)
        const role_result = await syncGuildAdminRole(app, guild)
        await app.bot.addRoleToMember(
          interaction.guild_id,
          interaction.member.user.id,
          role_result.role.id
        )

        return {
          type: D.InteractionResponseType.UpdateMessage,
          data: {
            content: `<@&${role_result.role.id}> has bot admin permissions. You can edit and assign it as you like`
          }
        }
      } else {
        throw new AppErrors.UnknownState(ctx.state.data.page)
      }
    })
