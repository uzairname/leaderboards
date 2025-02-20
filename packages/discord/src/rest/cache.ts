import * as D from 'discord-api-types/v10'

export class DiscordCache {
  guild_app_commands: { [id: string]: D.RESTGetAPIApplicationGuildCommandResult[] } = {}
  app_commands?: D.RESTGetAPIApplicationCommandsResult = undefined
}
