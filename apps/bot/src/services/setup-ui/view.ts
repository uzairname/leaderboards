import { Context, ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'
import { Colors } from '../../utils'
import { AllRankingsHandlers } from '../rankings/ui/all-rankings/handlers'
import { SetupHandlers } from './handlers'
import { admin_role_method_options } from './setup-cmd'

export const setup_view_sig = new ViewSignature({
  custom_id_prefix: 'setup',
  state_schema: {
    handler: field.Choice(SetupHandlers),
    admin_role_method: field.Enum(admin_role_method_options),
  },
})

export const setup_view = setup_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return ctx.state.get.handler()(app, ctx)
  },
})

export async function adminRolePage(
  app: App,
  ctx: Context<typeof setup_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const current_admin_role_id = (await app.db.guilds.fetch(ctx.interaction.guild_id))?.data.admin_role_id

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
    {
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.StringSelect,
          custom_id: ctx.state.set.handler(SetupHandlers.onAdminRoleMethodSelect).cId(),
          placeholder: `What do you want to do?`,
          options: [
            {
              label: 'Create one for me',
              value: admin_role_method_options.new,
              default: ctx.state.is.admin_role_method('new'),
            },
            {
              label: 'Use an existing role',
              value: admin_role_method_options.choose,
              default: ctx.state.is.admin_role_method('choose'),
            },
          ].concat(
            current_admin_role_id
              ? [
                  {
                    label: `Unset the admin role`,
                    value: admin_role_method_options.unset,
                    default: ctx.state.is.admin_role_method('unset'),
                  },
                ]
              : [],
          ),
        },
      ],
    },
  ]

  if (ctx.state.is.admin_role_method('choose')) {
    components.push({
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.RoleSelect,
          custom_id: ctx.state.set.handler(SetupHandlers.onAdminRoleSelect).cId(),
        },
      ],
    })
  }

  components.push({
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        label: current_admin_role_id ? 'Next' : 'Skip',
        style: D.ButtonStyle.Primary,
        custom_id: ctx.state.set.handler(AllRankingsHandlers.sendAllRankingsPage).cId(),
      },
    ],
  })

  let description = `# Set the Admin Role

Server members with this role will be able to **manage rankings, matches, and players**. 

This is optional. Server members with the Administrator permissions, or anyone who can run this command, will have bot admin access regardless of their role.

With the dropdowns below, you can
- **Let the bot create** an admin role for you
- **Select an existing role** to give admin perms to
- **Unset** the current admin role`

  if (current_admin_role_id) {
    description += `\n\nThe current admin role is set to <@&${current_admin_role_id}>`
  } else {
    description += `\n\n`
  }

  return {
    embeds: [
      {
        title: 'Settings ➛ Admin Role',
        description,
        color: Colors.Primary,
      },
    ],
    components,
    flags: D.MessageFlags.Ephemeral,
  }
}
