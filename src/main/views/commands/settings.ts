import * as D from 'discord-api-types/v10'
import {
  CommandView,
  field,
  _,
  InteractionContext,
  ChatInteractionResponse,
} from '../../../discord-framework'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'
import { getOrAddGuild, syncGuildAdminRole } from '../../modules/guilds'
import { checkGuildInteraction, ensureAdminPerms } from '../utils/checks'
import { rankings_cmd_def } from './rankings/rankings_cmd'

const settings_cmd = new CommandView({
  type: D.ApplicationCommandType.ChatInput,

  custom_id_prefix: 's',

  name: 'settings',
  description: 'Settings',

  state_schema: {
    callback: field.Choice({
      onAdminRoleBtn,
    }),
  },
})

export const settingsCmd = (app: App) =>
  settings_cmd
    .onCommand(async ctx => {
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: {
          components: [
            {
              type: D.ComponentType.ActionRow,
              components: [
                {
                  type: D.ComponentType.Button,
                  label: '⭐ Rankings',
                  style: D.ButtonStyle.Primary,
                  custom_id: rankings_cmd_def.newState().cId(),
                },
                {
                  type: D.ComponentType.Button,
                  label: 'Admin Role',
                  style: D.ButtonStyle.Primary,
                  custom_id: ctx.state.set.callback(onAdminRoleBtn).cId(),
                },
              ],
            },
          ],
          flags: D.MessageFlags.Ephemeral,
        },
      }
    })

    .onComponent(async ctx => {
      return await ctx.state.get('callback')(app, ctx)
    })

async function onAdminRoleBtn(
  app: App,
  ctx: InteractionContext<typeof settings_cmd>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)

  const interaction = checkGuildInteraction(ctx.interaction)
  const guild = await getOrAddGuild(app, interaction.guild_id)

  const role_result = await syncGuildAdminRole(app, guild)

  await app.bot.addRoleToMember(
    interaction.guild_id,
    interaction.member.user.id,
    role_result.role.id,
  )

  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: {
      embeds: [
        {
          title: 'Admin Role',
          description: `The role <@&${role_result.role.id}> can manage rankings and matches. You can rename, edit, and assign it to anyone`,
        },
      ],
    },
  }
}
