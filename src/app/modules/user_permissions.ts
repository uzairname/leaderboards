import { APIInteractionGuildMember, PermissionFlagsBits } from 'discord-api-types/v10'
import { Guild } from '../../database/models'
import { AppErrors } from '../errors'

export async function checkMemberBotAdmin(
  member: APIInteractionGuildMember,
  guild: Guild,
): Promise<void> {
  let admin_role_id = guild.data.admin_role_id
  let hasAdminRole = admin_role_id !== null && member.roles.includes(admin_role_id)
  let hasAdminPerms =
    (BigInt(member.permissions) & PermissionFlagsBits.Administrator) ===
    PermissionFlagsBits.Administrator

  if (!hasAdminRole && !hasAdminPerms) {
    throw new AppErrors.UserMissingPermissions(
      `You need${admin_role_id ? ` the <@&${admin_role_id}> role or` : ``} admin perms to do this`,
    )
  }
}
