import { DiscordAPIError } from '@discordjs/rest'
import * as D from 'discord-api-types/v10'
import { GuildChannelData, RoleData } from '../../../../discord-framework'
import { sentry } from '../../../../logging/sentry'
import { isInt } from '../../../../utils/utils'
import { App } from '../../../app/App'
import { Guild } from '../../../../database/models'
import { Colors } from '../../helpers/constants'

export async function getOrAddGuild(app: App, guild_id: string): Promise<Guild> {
  let app_guild = await app.db.guilds.get(guild_id)
  if (app_guild) {
    // Update if necessary
    await checkUpdateGuild(app, app_guild)
  } else {
    // Add guild
    app_guild = await addGuild(app, guild_id)
  }
  return app_guild
}

export async function addGuild(app: App, guild_id: string): Promise<Guild> {
  const discord_guild = await app.bot.getGuild(guild_id)
  const guilds_version = (await app.db.settings.getOrUpdate()).data.versions.guilds

  const app_guild = await app.db.guilds.create({
    id: discord_guild.id,
    name: discord_guild.name,
    version: guilds_version,
  })
  await updateGuild(app, app_guild)

  await syncGuildAdminRole(app, app_guild)
  return app_guild
}

export async function checkUpdateGuild(app: App, guild: Guild): Promise<void> {
  const latest_version = (await app.db.settings.getOrUpdate()).data.versions.guilds

  if (isInt(guild.data.version) && guild.data.version < latest_version) {
    sentry.addBreadcrumb({
      message: `Guild ${guild.data.name} is outdated (v${guild.data.version} < v${latest_version}). Updating`,
    })
    await updateGuild(app, guild)
    await guild.update({ version: latest_version })
  }
}

async function updateGuild(app: App, guild: Guild) {
  await app.syncDiscordCommands(guild)
}

export async function communityEnabled(app: App, guild_id: string): Promise<boolean> {
  const discord_guild = await app.bot.getGuild(guild_id)
  return discord_guild.features.includes(D.GuildFeature.Community)
}

export async function getMatchLogsChannel(
  app: App,
  guild: Guild,
): Promise<D.APIChannel | undefined> {
  const channel_id = guild.data.matches_channel_id
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

export async function syncRankedCategory(
  app: App,
  guild: Guild,
): Promise<{
  channel: D.APIChannel
  is_new_channel: boolean
}> {
  const category_id = guild.data.category_id

  const result = await app.bot.utils.syncGuildChannel({
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
  const result = await app.bot.utils.syncRole({
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
