import { APIApplicationCommand, ApplicationCommandType } from 'discord-api-types/v10'

import { AnyCommandView, DiscordRESTClient } from '../../../discord'
import { config } from '../../../utils/globals'

import { App } from '../../app'

export class Colors {
  static Primary = 0xa1ffda
  static DiscordBackground = 0x313338
  static EmbedBackground = 0x2b2d31
}

export function relativeTimestamp(time: Date): string {
  return `<t:${Math.floor(time.getTime() / 1000)}:R>`
}

export function dateTimestamp(time: Date): string {
  return `<t:${Math.floor(time.getTime() / 1000)}:D>`
}

export function messageLink(guild_id: string, channel_id: string, message_id: string): string {
  return `https://discord.com/channels/${guild_id}/${channel_id}/${message_id}`
}

export function channelMention(channel_id?: string): string {
  return `<#${channel_id || '0'}>`
}

export async function commandMention(
  app: App,
  command: AnyCommandView
) {
  return await _commandMention(
    app,
    command.options.command.name,
    command.options.type,
    command.options.guild_id,
  )
}

export async function _commandMention(
  app: App,
  name: string,
  type: ApplicationCommandType = ApplicationCommandType.ChatInput,
  guild_id?: string,
): Promise<string> {
  let commands = (await app.bot.getAppCommands(guild_id)) as APIApplicationCommand[]
  let command = commands.find((command) => command.name === name && command.type === type)
  return `</${name}:${command?.id || '0'}>`
}

export function inviteUrl(bot: DiscordRESTClient): string {
  return (
    'https://discord.com/api/oauth2/authorize?' +
    new URLSearchParams({
      client_id: bot.application_id,
      scope: 'bot',
      permissions: config.REQUIRED_BOT_PERMISSIONS.toString(),
    }).toString()
  )
}
