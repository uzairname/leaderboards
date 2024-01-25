import * as D from 'discord-api-types/v10'
import { AnyView, InteractionContext } from '../../../discord-framework'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'
import { getOrAddGuild } from '../../modules/guilds'

export function checkGuildInteraction<T extends D.APIBaseInteraction<any, any>>(
  interaction: T,
): D.APIGuildInteractionWrapper<T> {
  if (!D.Utils.isGuildInteraction(interaction)) {
    throw new AppErrors.InteractionNotGuild()
  }
  return interaction as D.APIGuildInteractionWrapper<T>
}

export async function hasAdminPerms(app: App, ctx: InteractionContext<any>) {
  const { has_perms } = await determineAdminPerms(app, ctx)
  return has_perms
}

export async function ensureAdminPerms(app: App, ctx: InteractionContext<any>): Promise<void> {
  const { has_perms, admin_role_id } = await determineAdminPerms(app, ctx)

  if (!has_perms) {
    throw new AppErrors.UserMissingPermissions(
      `You need${admin_role_id ? ` the <@&${admin_role_id}> role or` : ``} admin perms to do this`,
    )
  }
}

async function determineAdminPerms(app: App, ctx: InteractionContext<AnyView>) {
  const interaction = checkGuildInteraction(ctx.interaction)

  const guild = await getOrAddGuild(app, interaction.guild_id)
  const member = interaction.member
  let is_owner = app.config.OwnerIds.includes(member.user.id)
  let admin_role_id = guild.data.admin_role_id
  let has_admin_role = admin_role_id !== null && member.roles.includes(admin_role_id)
  let has_admin_perms =
    (BigInt(member.permissions) & D.PermissionFlagsBits.Administrator) ===
    D.PermissionFlagsBits.Administrator

  return {
    has_perms: has_admin_role || has_admin_perms || is_owner,
    admin_role_id,
  }
}
