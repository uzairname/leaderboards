import { APIThreadChannel, APIMessage } from 'discord-api-types/v10'

export type RESTPostAPIGuildForumThreadsResult = APIThreadChannel & {
  message: APIMessage
}
