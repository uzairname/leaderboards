import * as D from 'discord-api-types/v10'
import {
  AppCommand,
  field,
  _,
  InteractionContext,
  ChatInteractionResponse,
} from '../../../discord-framework'
import { ViewState } from '../../../discord-framework/interactions/view_state'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'
import { Colors } from '../../messages/message_pieces'
import { getOrAddGuild, syncGuildAdminRole } from '../../modules/guilds'
import { rankings_cmd_def } from '../../modules/rankings_commands/rankings_cmd'
import { ViewModule, globalView } from '../../modules/view_manager/view_module'
import { checkGuildInteraction, ensureAdminPerms } from '../utils/checks'

export const settings_cmd_def = new AppCommand({
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
  settings_cmd_def
    .onCommand(async ctx => {
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: await settingsPage(app),
      }
    })

    .onComponent(async ctx => {
      return ctx.state.get.callback()(app, ctx)
    })

async function settingsPage(app: App): Promise<D.APIInteractionResponseCallbackData> {
  const state = settings_cmd_def.newState()
  return {
    embeds: [
      {
        title: 'Settings',
        description: ``,
        color: Colors.EmbedBackground,
      },
    ],
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            label: 'Manage Rankings',
            style: D.ButtonStyle.Primary,
            custom_id: rankings_cmd_def.newState().cId(),
          },
          {
            type: D.ComponentType.Button,
            label: 'Admin Role',
            style: D.ButtonStyle.Primary,
            custom_id: state.set.callback(onAdminRoleBtn).cId(),
          },
        ],
      },
    ],
    flags: D.MessageFlags.Ephemeral,
  }
}

async function onAdminRoleBtn(
  app: App,
  ctx: InteractionContext<typeof settings_cmd_def>,
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
          color: Colors.EmbedBackground,
        },
      ],
    },
  }
}
