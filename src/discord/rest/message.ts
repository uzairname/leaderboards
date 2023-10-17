import {
  APIEmbed,
  APIMessage,
  APIThreadChannel,
  RESTPatchAPIChannelMessageJSONBody,
  RESTPostAPIChannelMessageJSONBody,
} from 'discord-api-types/v10'

export type RESTPostAPIGuildForumThreadsResult = APIThreadChannel & {
  message: APIMessage
}

export class Message {
  // create or update message data
  patchdata: RESTPatchAPIChannelMessageJSONBody
  postdata: RESTPostAPIChannelMessageJSONBody
  constructor(body: RESTPatchAPIChannelMessageJSONBody) {
    this.patchdata = body
    this.postdata = body as RESTPostAPIChannelMessageJSONBody
  }
}

export class MessageBuilder {
  content?: string
  embeds?: APIEmbed[]
  components?: []

  constructor(params?: { content: string; embeds: APIEmbed[]; component: [] }) {
    this.content = params?.content
    this.embeds = params?.embeds
    this.components = params?.component
  }

  message() {
    return new Message({
      content: this.content,
      embeds: this.embeds,
      components: this.components,
    })
  }
}
