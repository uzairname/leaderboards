import { GuildInteraction } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { UserError } from '../errors/user-errors'
import { App } from '../setup/app'

export type GuildAuth = GuildInteraction // Can add other kinds of auth later

export async function hasAdminPerms(app: App, auth: GuildAuth) {
  const { has_perms } = await determineGuildAdminPerms(app, auth)
  return has_perms
}

// Ensures that the user has bot admin permissions in the guild
export async function ensureGuildAdminPerms(app: App, auth: GuildAuth): Promise<void> {
  const { has_perms, admin_role_id } = await determineGuildAdminPerms(app, auth)

  if (!has_perms) {
    throw new UserError(`You need${admin_role_id ? ` the <@&${admin_role_id}> role or` : ``} admin perms to do this`)
  }
}

async function determineGuildAdminPerms(app: App, auth: GuildAuth) {
  const interaction = auth

  const guild = await app.guilds.get(app, interaction.guild_id)
  const member = interaction.member
  const is_owner = app.config.OwnerIds.includes(member.user.id)
  const admin_role_id = guild.data.admin_role_id
  const has_admin_role = null !== admin_role_id && member.roles.includes(admin_role_id)
  const has_admin_perms =
    (BigInt(member.permissions) & D.PermissionFlagsBits.Administrator) === D.PermissionFlagsBits.Administrator

  return {
    has_perms: has_admin_role || has_admin_perms || is_owner,
    admin_role_id,
  }
}
