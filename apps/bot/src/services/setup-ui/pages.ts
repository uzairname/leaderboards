import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'
import { SetupHandlers } from '.'
import { setup_view_sig } from './view'
import { Context } from '@repo/discord'
import { breadcrumbsTitle, Colors } from '../../utils'
import { AllRankingsHandlers } from '../rankings/ui/all-rankings'
import { admin_role_method_options } from './view'
import { all_rankings_view_sig } from '../rankings/ui/all-rankings/view'


export async function start(app: App): Promise<D.APIInteractionResponseCallbackData> {
  return {
    embeds: [
      {
        title: `Welcome`,
        description: `This walkthrough will help you set up the bot in your server.`,
        color: Colors.Primary,
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
export async function adminRolePage(
  app: App,
  ctx: Context<typeof setup_view_sig>
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
              : []
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
        custom_id: all_rankings_view_sig.newState({
          handler: AllRankingsHandlers.sendMainPage,
        }).cId(),
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
        title: breadcrumbsTitle(`Settings`, `Admin Role`),
        description,
        color: Colors.Primary,
      },
    ],
    components,
    flags: D.MessageFlags.Ephemeral,
  }
}

