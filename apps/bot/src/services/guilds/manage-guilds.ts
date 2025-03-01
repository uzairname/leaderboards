import { Guild } from '@repo/db/models'
import { GuildChannelData, RoleData } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'
import { Colors } from '../../utils/ui'

export async function getOrAddGuild(app: App, guild_id: string): Promise<Guild> {
  let app_guild = await app.db.guilds.fetch(guild_id)
  if (!app_guild) {
    app_guild = await registerGuild(app, guild_id)
  }
  return app_guild
}

export async function registerGuild(app: App, guild_id: string): Promise<Guild> {
  const discord_guild = await app.discord.getGuild(guild_id)

  const app_guild = await app.db.guilds.create({
    id: discord_guild.id,
    name: discord_guild.name,
  })
  await updateGuild(app, app_guild)

  await syncGuildAdminRole(app, app_guild)
  return app_guild
}

export async function updateGuild(app: App, guild: Guild): Promise<void> {
  await app.syncDiscordCommands(guild)
}

export async function communityEnabled(app: App, guild_id: string): Promise<boolean> {
  const discord_guild = await app.discord.getGuild(guild_id)
  return discord_guild.features.includes(D.GuildFeature.Community)
}

export async function syncRankedCategory(
  app: App,
  guild: Guild,
): Promise<{
  channel: D.APIChannel
  is_new_channel: boolean
}> {
  const category_id = guild.data.category_id

  const result = await app.discord.utils.syncGuildChannel({
    target_channel_id: category_id,
    channelData: async () => {
      return {
        guild_id: guild.data.id,
        data: new GuildChannelData({
          name: 'Ranked',
          type: D.ChannelType.GuildCategory,
        }),
      }
    },
  })

  if (result.is_new_channel) {
    await guild.update({ category_id: result.channel.id })
  }

  return result
}

/**
 * Ensures that the guild has an admin role.
 * @param role_id overwrite the current admin role with this one, if it exists.
 */
export async function syncGuildAdminRole(
  app: App,
  guild: Guild,
  role_id?: string,
): Promise<{
  role: D.APIRole
}> {
  const result = await app.discord.utils.syncRole({
    guild_id: guild.data.id,
    target_role_id: role_id ?? guild.data.admin_role_id,
    roleData: async () => {
      return new RoleData({ name: 'Leaderboards Admin', color: Colors.Primary, permissions: '0' })
    },
    no_edit: true,
  })

  await guild.update({ admin_role_id: result.role.id })
  return result
}
