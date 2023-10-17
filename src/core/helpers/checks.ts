import {
  APIBaseInteraction,
  APIGuildInteractionWrapper,
  APIInteractionGuildMember,
  PermissionFlagsBits,
} from 'discord-api-types/v10'
import { AppErrors } from '../errors'
import { isGuildInteraction } from 'discord-api-types/utils/v10'
import { Guild } from '../../database/models'

export async function checkBotAdmin(
  member: APIInteractionGuildMember,
  guild: Guild,
): Promise<void> {
  let admin_role_id = guild.data.admin_role_id
  let hasAdminRole = admin_role_id == null || member.roles.includes(admin_role_id)
  let hasAdminPerms =
    (BigInt(member.permissions) & PermissionFlagsBits.Administrator) ===
    PermissionFlagsBits.Administrator

  if (!hasAdminRole && !hasAdminPerms) {
    throw new AppErrors.UserMissingPermissions(
      `You need${
        admin_role_id ? ` the <@&${admin_role_id}> role or` : ``
      } admin permissions to do this`,
    )
  }
}

export function checkGuildInteraction<T extends APIBaseInteraction<any, any>>(
  interaction: T,
): APIGuildInteractionWrapper<T> {
  if (!isGuildInteraction(interaction)) {
    throw new AppErrors.InteractionNotGuild()
  }
  return interaction as APIGuildInteractionWrapper<T>
}
