import type { AnyCommandHandler } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import type { App } from '../../setup/app'

export const emojis = {
  green_triangle: `<:green_triangle:1198069662353735740>`,
  light_circle: `<:light_circle:1198070971513438269>`,
  red_triangle: `<:red_triangle:1198069664153079878>`,
}

export enum Colors {
  Primary = 0xa1ffda,
  Success = 0x5fde70,
  Pending = 0xdee887,
  DiscordBackground = 0x313338,
  EmbedBackground = 0x2b2d31,
  Error = 0xff4d4d,
}

export function randomColor() {
  // Returns a random color with value greater than 0.5 and saturation greater than 0.5
  return Math.floor(Math.random() * 0xffffff)
}

export function inviteUrl(app: App): string {
  return app.discord.botInviteURL(app.config.RequiredBotPermissions).toString()
}

export async function commandMention(
  app: App,
  command: AnyCommandHandler,
  guild_id?: string,
  subcommand_name?: string,
): Promise<string> {
  const name = command.signature.name
  const subcmd_str = subcommand_name ? ` ${subcommand_name}` : ''
  const type = command.signature.config.type
  if (guild_id && !command.guildSignature) guild_id = undefined
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

// export const space = `⠀` // U+2800: Braille Pattern Blank
export const space = ` ` // U+2003: Em Space

export function spaces(n: number): string {
  return space.repeat(n)
}

export function messageLink(guild_id: string, channel_id: string, message_id: string): string {
  return `https://discord.com/channels/${guild_id}/${channel_id}/${message_id}`
}

/**
 * Returns a message link if the message exists, otherwise null
 */
export async function existingMessageLink(app: App, guild_id: string, channel_id: string, message_id: string) {
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
    return D.RouteBases.cdn + D.CDNRoutes.guildMemberAvatar(guild_id, member.user.id, member.avatar, format)
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

export function breadcrumbsTitle(...path: string[]) {
  return path.join(' ➛ ')
}

export type TableRow = (
  | string
  | {
      text: string
      format?: AnsiFormat
      color?: AnsiColor
      backgroundColor?: AnsiBgColor
      col_separator?: {
        format?: AnsiFormat
        color?: AnsiColor
        backgroundColor?: AnsiBgColor
      }
    }
)[]

export function formatTable(...rows: TableRow[]) {
  const col_widths = rows[0].map((_, i) =>
    Math.max(
      ...rows.map(row => {
        const cell = row[i]
        return typeof cell === 'string' ? cell.length : cell.text.length
      }),
    ),
  )
  return (
    `\`\`\`ansi\n` +
    rows
      .map((row, i) =>
        row
          .map((cell, j) => {
            const col_width = col_widths[j]
            const cellText = typeof cell === 'string' ? cell : cell.text
            const padded_cell = cellText.padEnd(col_width)
            if (typeof cell === 'string') return padded_cell
            const formatted_cell = formatAnsi(padded_cell, cell.color, cell.backgroundColor, cell.format)
            return formatted_cell
          })
          .join(formatAnsi(' | ', AnsiColor.DarkGray)),
      )
      .join('\n') +
    `\n\`\`\``
  )
}

export enum AnsiFormat {
  Normal = '0',
  Bold = '1',
  Underline = '4',
}

export enum AnsiColor {
  DarkGray = '30',
  Red = '31',
  Lime = '32',
  Gold = '33',
  Blue = '34',
  Pink = '35',
  Teal = '36',
  White = '37',
}

export enum AnsiBgColor {
  BlueishBlack = '40',
  RustBrown = '41',
  Gray40 = '42',
  Gray45 = '43',
  LightGray55 = '44',
  Blurple = '45',
  LightGray60 = '46',
  CreamWhite = '47',
}

export function formatAnsi(
  text: string,
  color: AnsiColor = AnsiColor.White,
  backgroundColor?: AnsiBgColor,
  format?: AnsiFormat,
) {
  const colorCode = `[${color}`
  const backgroundColorCode = backgroundColor ? `;${backgroundColor}` : ''
  const formatCode = format ? `;${format}` : ''
  return `${colorCode}${backgroundColorCode}${formatCode}m${text}[0m`
}
