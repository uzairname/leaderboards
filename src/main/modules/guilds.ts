import { DiscordAPIError } from '@discordjs/rest'
import * as D from 'discord-api-types/v10'
import { Guild } from '../../database/models'
import { GuildChannelData, RoleData } from '../../discord-framework'
import { App } from '../app-context/app-context'
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
  return discord_guild.features.includes(D.GuildFeature.Community)
}

export async function getMatchLogsChannel(
  app: App,
  guild_id: string,
): Promise<D.APIChannel | undefined> {
  const guild = await getOrAddGuild(app, guild_id)
  const channel_id = guild.data.match_results_channel_id
  if (channel_id) {
    try {
      return await app.bot.getChannel(channel_id)
    } catch (e) {
      if (e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownChannel)
        return undefined
      throw e
    }
  }
}

export async function getOrUpdateRankedCategory(
  app: App,
  guild: Guild,
): Promise<{
  channel: D.APIChannel
  is_new_channel: boolean
}> {
  let category_id = guild.data.category_id

  let result = await app.bot.utils.syncGuildChannel({
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

export async function syncGuildAdminRole(
  app: App,
  guild: Guild,
): Promise<{
  role: D.APIRole
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
