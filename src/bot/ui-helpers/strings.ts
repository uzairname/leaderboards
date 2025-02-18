import * as D from 'discord-api-types/v10'
import type { AnyChatInputCommand } from '../../discord-framework'
import type { App } from '../context/app'
import { AnyGuildCommand, AppView } from '../services/ViewModule'

export const github_url = 'https://github.com/uzairname/leaderboards'

export const emojis = {
  green_triangle: `<:green_triangle:1198069662353735740>`,
  light_circle: `<:light_circle:1198070971513438269>`,
  red_triangle: `<:red_triangle:1198069664153079878>`,
}

export function inviteAndRoleConnectionsUrl(app: App): string {
  return app.config.env.BASE_URL + `/oauth` + app.config.OauthRoutes.BotAndRoleConnections
}

export function inviteUrl(app: App): string {
  return app.discord.botInviteURL(app.config.RequiredBotPermissions).toString()
}

export async function commandMention<T extends AppView<AnyChatInputCommand>>(
  app: App,
  command: T,
  guild_id?: T extends AnyGuildCommand ? string : undefined,
  subcommand_name?: string,
) {
  const name = command.base_signature.config.name
  const subcmd_str = subcommand_name ? ` ${subcommand_name}` : ''
  const type = command.base_signature.config.type
  const commands = await app.discord.getAppCommands(guild_id)
  const discord_command = commands.find(command => command.name === name && command.type === type)
  return `</${name}${subcmd_str}:${discord_command?.id || '0'}>`
}

export function relativeTimestamp(time: Date): string {
  return `<t:${Math.floor(time.getTime() / 1000)}:R>`
}

export function dateTimestamp(time: Date): string {
  return `<t:${Math.floor(time.getTime() / 1000)}:D>`
}

/**
 * Escapes special Discord markdown characters: ( ` * _ ~ < : \ # )
 */
export function escapeMd(str: string | undefined | null): string {
  if (!str) return ''
  return str
    .replace(/\\/g, `\\\\`) // must be first to avoid double escaping
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/</g, '\\<')
    .replace(/:/g, '\\:')
    .replace(/#/g, '\\#')
}

export const space = `⠀` // U+2800: Braille Pattern Blank

export function spaces(n: number): string {
  return space.repeat(n)
}

export function truncateString(str: string, max_length: number): string {
  return str.length > max_length ? str.slice(0, max_length - 2) + '..' : str
}

export function messageLink(guild_id: string, channel_id: string, message_id: string): string {
  return `https://discord.com/channels/${guild_id}/${channel_id}/${message_id}`
}

/**
 * Returns a message link if the message exists, otherwise null
 */
export async function existingMessageLink(
  app: App,
  guild_id: string,
  channel_id: string,
  message_id: string,
) {
  try {
    const message = await app.discord.getMessage(channel_id, message_id)
    return messageLink(guild_id, message.channel_id, message_id)
  } catch {
    return null
  }
}

export async function existingChannelMention(app: App, channel_id?: string | null) {
  if (!channel_id) return null
  try {
    const channel = await app.discord.getChannel(channel_id)
    return `<#${channel.id}>`
  } catch {
    return null
  }
}

export function memberAvatarUrl(guild_id: string, member: D.APIGuildMember): string {
  if (member.avatar) {
    const format = member.avatar.startsWith('a_') ? D.ImageFormat.GIF : D.ImageFormat.PNG
    return (
      D.RouteBases.cdn +
      D.CDNRoutes.guildMemberAvatar(guild_id, member.user.id, member.avatar, format)
    )
  } else {
    return userAvatarUrl(member.user)
  }
}

export function userAvatarUrl(user: D.APIUser) {
  if (user.avatar) {
    const format = user.avatar.startsWith('a_') ? D.ImageFormat.GIF : D.ImageFormat.PNG
    return D.RouteBases.cdn + D.CDNRoutes.userAvatar(user.id, user.avatar, format)
  } else {
    const idx = ((((Number(user.id) >> 22) % 6) + 6) % 6) as D.DefaultUserAvatarAssets
    return D.RouteBases.cdn + D.CDNRoutes.defaultUserAvatar(idx)
  }
}

export function permsToString(perms: string[]) {
  return perms.join(', ')
}

export function listToString(list: string[], conjunction = 'and') {
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} ${conjunction} ${list[1]}`
  return `${list.slice(0, -1).join(', ')}, ${conjunction} ${list[list.length - 1]}`
}
