import * as D from 'discord-api-types/v10'
import { AnyAppCommand } from '../../../discord-framework'
import { App } from '../../context/app_context'

export class Colors {
  static Primary = 0xa1ffda
  static Secondary = 0x4a6666
  static DiscordBackground = 0x313338
  static EmbedBackground = 0x2b2d31
  static Success = 0x5fde70
}

export function relativeTimestamp(time: Date): string {
  return `<t:${Math.floor(time.getTime() / 1000)}:R>`
}

export function dateTimestamp(time: Date): string {
  return `<t:${Math.floor(time.getTime() / 1000)}:D>`
}

/**
 * Escapes special Discord markdown characters: ( ` * _ ~ < : \ )
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
}

export const space = `⠀`

export function truncateString(str: string, max_length: number): string {
  return str.length > max_length ? str.slice(0, max_length - 2) + '..' : str
}

export function messageLink(guild_id: string, channel_id: string, message_id: string): string {
  return `https://discord.com/channels/${guild_id}/${channel_id}/${message_id}`
}

export function channelMention(channel_id?: string): string {
  return `<#${channel_id || '0'}>`
}

export async function commandMention(app: App, command: AnyAppCommand, guild_id?: string) {
  const name = command.options.name
  const type = command.options.type
  let commands = (await app.bot.getAppCommands(guild_id)) as D.APIApplicationCommand[]
  let discord_command = commands.find(command => command.name === name && command.type === type)
  return `</${name}:${discord_command?.id || '0'}>`
}

export function inviteUrl(app: App): string {
  return (
    'https://discord.com/api/oauth2/authorize?' +
    new URLSearchParams({
      client_id: app.bot.application_id,
      scope: 'bot',
      permissions: app.config.RequiredBotPermissions.toString(),
    }).toString()
  )
}

export function botAndOauthUrl(app: App): string {
  return app.config.env.BASE_URL + `/oauth` + app.config.OauthRoutes.BotAndRoleConnections
}

export const emojis = {
  green_triangle: `<:green_triangle:1198069662353735740>`,
  light_circle: `<:light_circle:1198070971513438269>`,
  red_triangle: `<:red_triangle:1198069664153079878>`,
}
