import * as D from 'discord-api-types/v10'
import { ChatInteractionContext } from '../../../discord-framework'
import { App } from '../../app/app'
import { UserErrors } from '../../app/errors'
import { getOrAddGuild } from '../../modules/guilds'

export function checkGuildInteraction<T extends D.APIBaseInteraction<any, any>>(
  interaction: T
): D.APIGuildInteractionWrapper<T> {
  if (!D.Utils.isGuildInteraction(interaction)) {
    throw new UserErrors.InteractionNotGuild()
  }
  return interaction as D.APIGuildInteractionWrapper<T>
}

export async function hasAdminPerms(app: App, ctx: ChatInteractionContext<any>) {
  const { has_perms } = await determineAdminPerms(app, ctx)
  return has_perms
}

export async function ensureAdminPerms(app: App, ctx: ChatInteractionContext<any>): Promise<void> {
  const { has_perms, admin_role_id } = await determineAdminPerms(app, ctx)

  if (!has_perms) {
    throw new UserErrors.UserMissingPermissions(
      `You need${admin_role_id ? ` the <@&${admin_role_id}> role or` : ``} admin perms to do this`
    )
  }
}

async function determineAdminPerms(app: App, ctx: ChatInteractionContext<any>) {
  const interaction = checkGuildInteraction(ctx.interaction)

  const guild = await getOrAddGuild(app, interaction.guild_id)
  const member = interaction.member
  let is_owner = (await app.db.settings.getOrUpdate()).data.config['owner_ids'].includes(
    member.user.id
  )
  let admin_role_id = guild.data.admin_role_id
  let has_admin_role = admin_role_id !== null && member.roles.includes(admin_role_id)
  let has_admin_perms =
    (BigInt(member.permissions) & D.PermissionFlagsBits.Administrator) ===
    D.PermissionFlagsBits.Administrator

  return {
    has_perms: has_admin_role || has_admin_perms || is_owner,
    admin_role_id
  }
}
