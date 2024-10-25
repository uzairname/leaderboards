import * as D from 'discord-api-types/v10'
import {
  AppCommand,
  ChatInteractionResponse,
  field,
  InteractionContext,
} from '../../../../../../discord-framework'
import { App } from '../../../../../context/app_context'
import { Colors } from '../../../../common/constants'
import { syncDiscordCommands } from '../../../../manage-views/sync_discord_commands'
import { checkGuildInteraction, ensureAdminPerms } from '../../../../utils/perms'
import { AppView } from '../../../../utils/ViewModule'
import { getOrAddGuild, syncGuildAdminRole } from '../../../guilds'
import { rankings_cmd_signature } from '../../../rankings/views/commands/rankings'

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

export default new AppView(settings_cmd_def, (app: App) =>
  settings_cmd_def
    .onCommand(async ctx => {
      await syncDiscordCommands(app, ctx.interaction.guild_id)
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: await settingsPage(app),
      }
    })

    .onComponent(async ctx => {
      return ctx.state.get.callback()(app, ctx)
    }),
)

export async function settingsPage(app: App): Promise<D.APIInteractionResponseCallbackData> {
  const state = settings_cmd_def.createState()
  return {
    embeds: [
      {
        title: 'Settings',
        description: ``,
        color: Colors.Primary,
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
            custom_id: rankings_cmd_signature.createState({}).cId(),
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
          color: Colors.Primary,
        },
      ],
    },
  }
}
