import { CommandView, InteractionContext } from '@repo/discord'
import { field } from '@repo/utils'
import { Colors } from 'apps/bot/src/utils/ui/strings'
import * as D from 'discord-api-types/v10'
import { AppView } from '../../../../classes/ViewModule'
import { sentry } from '../../../../logging/sentry'
import { App } from '../../../../setup/app'
import { ensureAdminPerms } from '../../../../utils/perms'
import { getOrAddGuild, syncGuildAdminRole } from '../../../guilds/manage-guilds'
import { allRankingsPage } from '../../../rankings/views/pages/all-rankings-page'

const adminRoleMethodOptions = {
  new: 'new',
  choose: 'choose',
  unset: 'unset',
}

export const settings_cmd_signature = new CommandView({
  type: D.ApplicationCommandType.ChatInput,

  custom_id_prefix: 'sp',

  name: 'setup',
  description: 'Set up the bot in this server',

  state_schema: {
    callback: field.Choice({
      allRankingsPage,
      onAdminRoleMethodSelect,
      onAdminRoleSelect,
    }),
    admin_role_method: field.Enum(adminRoleMethodOptions),
  },
})

export default new AppView(settings_cmd_signature, app =>
  settings_cmd_signature
    .onCommand(async ctx => {
      ensureAdminPerms(app, ctx)
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: await adminRolePage(app, ctx),
      }
    })

    .onComponent(async ctx => {
      return {
        type: D.InteractionResponseType.UpdateMessage,
        data: await ctx.state.get.callback()(app, ctx),
      }
    }),
)

export async function startPage(app: App, ctx: InteractionContext<typeof settings_cmd_signature>): Promise<D.APIInteractionResponseCallbackData> {

  return {
    embeds: [{
      title: `Welcome`,
      description: `This bot is designed to help you manage your server's competitive scene.`
    }]
  }

}

export async function adminRolePage(
  app: App,
  ctx: InteractionContext<typeof settings_cmd_signature>,
): Promise<D.APIInteractionResponseCallbackData> {
  const current_admin_role_id = (await app.db.guilds.fetch(ctx.interaction.guild_id))?.data
    .admin_role_id

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
              value: adminRoleMethodOptions.new,
              default: ctx.state.is.admin_role_method('new'),
            },
            {
              label: 'Use an existing role',
              value: adminRoleMethodOptions.choose,
              default: ctx.state.is.admin_role_method('choose'),
            },
          ].concat(
            current_admin_role_id
              ? [
                  {
                    label: `Unset the admin role`,
                    value: adminRoleMethodOptions.unset,
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
        custom_id: ctx.state.set.callback(allRankingsPage).cId(),
      },
    ],
  })

  let description =
    `Server members with the admin role will be able to **manage rankings, matches, and players**. 

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
  ctx: InteractionContext<typeof settings_cmd_signature>,
): Promise<D.APIInteractionResponseCallbackData> {
  await ensureAdminPerms(app, ctx)

  const data = ctx.interaction.data as unknown as D.APIMessageStringSelectInteractionData
  const method = data.values[0]

  const guild = await getOrAddGuild(app, ctx.interaction.guild_id)

  if (method === adminRoleMethodOptions.new) {
    sentry.debug(`new`)
    ctx.state.save.admin_role_method('new')
    const role_result = await syncGuildAdminRole(app, guild)
    await app.discord.addRoleToMember(
      ctx.interaction.guild_id,
      ctx.interaction.member.user.id,
      role_result.role.id)
  } else if (method === adminRoleMethodOptions.choose) {
    sentry.debug(`choose`)
    ctx.state.save.admin_role_method('choose')
  } else if (method === adminRoleMethodOptions.unset) {
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
  ctx: InteractionContext<typeof settings_cmd_signature>,
): Promise<D.APIInteractionResponseCallbackData> {
  await ensureAdminPerms(app, ctx)

  const data = ctx.interaction.data as unknown as D.APIMessageRoleSelectInteractionData
  const role_id = data.values[0]

  const guild = await getOrAddGuild(app, ctx.interaction.guild_id)

  // Try adding the role to the user. If this throws an error, the bot is either
  // missing permissions, or it is a reserved role.
  await app.discord.addRoleToMember(
    ctx.interaction.guild_id,
    ctx.interaction.member.user.id,
    role_id,
  )
  await syncGuildAdminRole(app, guild, role_id)

  return adminRolePage(app, ctx)
}
