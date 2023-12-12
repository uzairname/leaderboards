import {
  APIBaseInteraction,
  APIGuildInteractionWrapper,
  PermissionFlagsBits,
} from 'discord-api-types/v10'
import { isGuildInteraction } from 'discord-api-types/utils/v10'

import { BaseContext } from '../../discord-framework'

import { Guild } from '../../database/models'

import { UserError, UserErrors } from '../errors'
import { App } from '../app'
import { getOrAddGuild } from '../modules/guilds'
import { sentry } from '../../logging/globals'

export function checkGuildInteraction<T extends APIBaseInteraction<any, any>>(
  interaction: T,
): APIGuildInteractionWrapper<T> {
  if (!isGuildInteraction(interaction)) {
    throw new UserErrors.InteractionNotGuild()
  }
  return interaction as APIGuildInteractionWrapper<T>
}
export async function checkInteractionMemberPerms(
  app: App,
  ctx: BaseContext<any>,
  guild?: Guild,
): Promise<void> {
  let guild_interaction = checkGuildInteraction(ctx.interaction)
  if (!guild) {
    guild = await getOrAddGuild(app, guild_interaction.guild_id)
  }
  let member = guild_interaction.member
  let is_owner = (await app.db.settings.getOrUpdate()).data.config['owner_ids'].includes(
    member.user.id,
  )
  let admin_role_id = guild.data.admin_role_id
  let has_admin_role = admin_role_id !== null && member.roles.includes(admin_role_id)
  let has_admin_perms =
    (BigInt(member.permissions) & PermissionFlagsBits.Administrator) ===
    PermissionFlagsBits.Administrator

  sentry.debug(
    `member ${member.user.username}, has_admin_role: ${has_admin_role}, has_admin_perms: ${has_admin_perms}, is_owner: ${is_owner}`,
  )

  if (!has_admin_role && !has_admin_perms && !is_owner) {
    sentry.debug('no perms')
    throw new UserErrors.UserMissingPermissions(
      `You need${admin_role_id ? ` the <@&${admin_role_id}> role or` : ``} admin perms to do this`,
    )
  }
}
