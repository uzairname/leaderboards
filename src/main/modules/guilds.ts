import { APIChannel, APIRole, ChannelType, GuildFeature } from 'discord-api-types/v10'
import { GuildChannelData, RoleData } from '../../discord-framework'

import { Guild } from '../../database/models'

import { App } from '../app/app'
import { Colors } from '../messages/message_pieces'

export async function getOrAddGuild(app: App, guild_id: string): Promise<Guild> {
  let app_guild = await app.db.guilds.get(guild_id)
  if (!app_guild) {
    let discord_guild = await app.bot.getGuild(guild_id)
    app_guild = await app.db.guilds.create({
      id: discord_guild.id,
      name: discord_guild.name,
    })
  }
  return app_guild
}

export async function communityEnabled(app: App, guild_id: string): Promise<boolean> {
  const discord_guild = await app.bot.getGuild(guild_id)
  return discord_guild.features.includes(GuildFeature.Community)
}

export async function syncRankedCategory(
  app: App,
  guild: Guild,
): Promise<{
  channel: APIChannel
  is_new_channel: boolean
}> {
  let category_id = guild.data.category_id

  let result = await app.bot.utils.syncGuildChannel({
    target_channel_id: category_id,
    channelData: async () => {
      return {
        guild_id: guild.data.id,
        data: new GuildChannelData({
          name: 'RANKED',
          type: ChannelType.GuildCategory,
        }),
      }
    },
  })

  if (result.is_new_channel) {
    await guild.update({ category_id: result.channel.id })
  }

  return result
}

export async function syncGuildAdminRole(
  app: App,
  guild: Guild,
): Promise<{
  role: APIRole
  is_new_role: boolean
}> {
  let result = await app.bot.utils.syncRole({
    guild_id: guild.data.id,
    target_role_id: guild.data.admin_role_id,
    roleData: async () => {
      return new RoleData({ name: 'Leaderboards Admin', color: Colors.Primary, permissions: '0' })
    },
  })

  if (result.is_new_role) {
    await guild.update({ admin_role_id: result.role.id })
  }
  return result
}
