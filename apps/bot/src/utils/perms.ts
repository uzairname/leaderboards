import { AnyInteractionContext, checkGuildInteraction, InteractionContext } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { UserError } from '../errors/user-errors'
import { getOrAddGuild } from '../services/guilds/manage-guilds'
import { App } from '../setup/app'

export async function hasAdminPerms(app: App, ctx: InteractionContext<any>) {
  const { has_perms } = await determineAdminPerms(app, ctx)
  return has_perms
}

export async function ensureAdminPerms(app: App, ctx: InteractionContext<any>): Promise<void> {
  const { has_perms, admin_role_id } = await determineAdminPerms(app, ctx)

  if (!has_perms) {
    throw new UserError(`You need${admin_role_id ? ` the <@&${admin_role_id}> role or` : ``} admin perms to do this`)
  }
}

async function determineAdminPerms(app: App, ctx: AnyInteractionContext) {
  const interaction = checkGuildInteraction(ctx.interaction)
  const guild = await getOrAddGuild(app, interaction.guild_id)
  const member = interaction.member
  const is_owner = app.config.OwnerIds.includes(member.user.id)
  const admin_role_id = guild.data.admin_role_id
  const has_admin_role = admin_role_id !== null && member.roles.includes(admin_role_id)
  const has_admin_perms =
    (BigInt(member.permissions) & D.PermissionFlagsBits.Administrator) === D.PermissionFlagsBits.Administrator

  return {
    has_perms: has_admin_role || has_admin_perms || is_owner,
    admin_role_id,
  }
}
