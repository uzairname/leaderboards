import * as D from 'discord-api-types/v10'

export type RESTPostAPIGuildForumThreadsResult = D.APIThreadChannel & {
  message: D.APIMessage
}
export class DiscordCache {
  guild_app_commands: { [id: string]: D.RESTGetAPIApplicationGuildCommandResult[] } = {}
  app_commands?: D.RESTGetAPIApplicationCommandsResult = undefined
}

export abstract class DiscordRESTLogger {
  abstract log(message: string): void
}
