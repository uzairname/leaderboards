import * as D from 'discord-api-types/v10'

export type RESTPostAPIGuildForumThreadsResult = D.APIThreadChannel & {
  message: D.APIMessage
}
