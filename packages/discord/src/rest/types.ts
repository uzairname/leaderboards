import * as D from 'discord-api-types/v10'

export type RESTPostAPIGuildForumThreadsResult = D.APIThreadChannel & {
  message: D.APIMessage
}
export class DiscordCache {
  guildAppCommands: { [id: string]: D.RESTGetAPIApplicationGuildCommandResult[] } = {}
  appCommands?: D.RESTGetAPIApplicationCommandsResult = undefined
}

export abstract class DiscordRESTLogger {
  abstract log(message: string): void
}
