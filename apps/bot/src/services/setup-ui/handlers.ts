import { ChatInteractionResponse, ComponentContext, Context } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../logging/sentry'
import { App } from '../../setup/app'
import { ensureAdminPerms } from '../../utils'
import { getOrAddGuild, syncGuildAdminRole } from '../guilds/manage-guilds'
import { admin_role_method_options } from './view'
import { setup_view_sig } from './view'
import { adminRolePage } from './pages'


export async function sendAdminRolePage(
  app: App,
  ctx: Context<typeof setup_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await adminRolePage(app, ctx),
  }
}

/**
 * The user selects an action to take for the admin role.
 */
export async function onAdminRoleMethodSelect(
  app: App,
  ctx: ComponentContext<typeof setup_view_sig>,
): Promise<ChatInteractionResponse> {
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

  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await adminRolePage(app, ctx),
  }
}

/**
 * The user selects an existig role to set as the admin role.
 */
export async function onAdminRoleSelect(
  app: App,
  ctx: ComponentContext<typeof setup_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    await ensureAdminPerms(app, ctx)

    const data = ctx.interaction.data as unknown as D.APIMessageRoleSelectInteractionData
    const role_id = data.values[0]

    const guild = await getOrAddGuild(app, ctx.interaction.guild_id)

    // Try adding the role to the user. If this throws an error, the bot is either
    // missing permissions, or it is a reserved role.
    await app.discord.addRoleToMember(ctx.interaction.guild_id, ctx.interaction.member.user.id, role_id)
    await syncGuildAdminRole(app, guild, role_id)

    await ctx.edit(await adminRolePage(app, ctx))
  })
}
