import { CommandSignature, ComponentContext, InitialContext, ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import { Colors } from 'apps/bot/src/utils/ui'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../logging/sentry'
import { App } from '../../setup/app'
import { ensureAdminPerms } from '../../utils/perms'
import { getOrAddGuild, syncGuildAdminRole } from '../guilds/manage-guilds'
import { rankingsPage } from '../rankings/views/rankings-view'

const admin_role_method_options = {
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

export const setup_view_sig = new ViewSignature({
  custom_id_prefix: 'setup',
  state_schema: {
    callback: field.Choice({
      adminRolePage,
      onAdminRoleMethodSelect,
      onAdminRoleSelect,
      rankingsPage,
    }),
    admin_role_method: field.Enum(admin_role_method_options),
  },
})

export const setup_view = setup_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: await ctx.state.get.callback()(app, ctx),
    }
  },
})

export async function adminRolePage(
  app: App,
  ctx: InitialContext<typeof setup_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const current_admin_role_id = (await app.db.guilds.fetch(ctx.interaction.guild_id))?.data.admin_role_id

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
    {
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.StringSelect,
          custom_id: ctx.state.set.callback(onAdminRoleMethodSelect).cId(),
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
          custom_id: ctx.state.set.callback(onAdminRoleSelect).cId(),
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
        custom_id: ctx.state.set.callback(rankingsPage).cId(),
      },
    ],
  })

  let description = `Server members with the admin role will be able to **manage rankings, matches, and players**. 

Server members with the Administrator permissions, or anyone who can run this command, will have bot admin access regardless of their role. If this is sufficient, you can skip this step.

With the dropdowns below, you can
- **Let the bot create** an admin role for you
- **Select an existing role** to give admin perms to
- **Unset** the current admin role`

  if (current_admin_role_id) {
    description += `\n\nThe current admin role is set to <@&${current_admin_role_id}>`
  } else {
    description += `\n\n
`
  }

  return {
    embeds: [
      {
        title: 'Step 1: Set the  Admin Role',
        description,
        color: Colors.Primary,
      },
    ],
    components,
    flags: D.MessageFlags.Ephemeral,
  }
}

/**
 * The user selects an action to take for the admin role.
 */
async function onAdminRoleMethodSelect(
  app: App,
  ctx: ComponentContext<typeof setup_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  await ensureAdminPerms(app, ctx)

  const data = ctx.interaction.data as unknown as D.APIMessageStringSelectInteractionData
  const method = data.values[0]

  const guild = await getOrAddGuild(app, ctx.interaction.guild_id)

  if (method === admin_role_method_options.new) {
    sentry.debug(`new`)
    ctx.state.save.admin_role_method('new')
    const role_result = await syncGuildAdminRole(app, guild)
    await app.discord.addRoleToMember(ctx.interaction.guild_id, ctx.interaction.member.user.id, role_result.role.id)
  } else if (method === admin_role_method_options.choose) {
    sentry.debug(`choose`)
    ctx.state.save.admin_role_method('choose')
  } else if (method === admin_role_method_options.unset) {
    sentry.debug(`unset`)
    ctx.state.save.admin_role_method('unset')
    await app.db.guilds.get(ctx.interaction.guild_id).update({ admin_role_id: null })
  }

  return adminRolePage(app, ctx)
}

/**
 * The user selects an existig role to set as the admin role.
 */
async function onAdminRoleSelect(
  app: App,
  ctx: ComponentContext<typeof setup_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  await ensureAdminPerms(app, ctx)

  const data = ctx.interaction.data as unknown as D.APIMessageRoleSelectInteractionData
  const role_id = data.values[0]

  const guild = await getOrAddGuild(app, ctx.interaction.guild_id)

  // Try adding the role to the user. If this throws an error, the bot is either
  // missing permissions, or it is a reserved role.
  await app.discord.addRoleToMember(ctx.interaction.guild_id, ctx.interaction.member.user.id, role_id)
  await syncGuildAdminRole(app, guild, role_id)

  return adminRolePage(app, ctx)
}
