import {
  APIEmbed,
  ChannelType,
  RESTPatchAPIChannelJSONBody,
  RESTPatchAPIChannelMessageJSONBody,
  RESTPatchAPIGuildRoleJSONBody,
  RESTPostAPIChannelMessageJSONBody,
  RESTPostAPIGuildChannelJSONBody,
  RESTPostAPIGuildRoleJSONBody,
} from 'discord-api-types/v10'

export class MessageData {
  /**
   * A message without nonce, tts, message reference, or stickers.
   * All properties are editable in discord.
   * @param body
   */
  constructor(body: RESTPatchAPIChannelMessageJSONBody) {
    this.patchdata = body
    this.postdata = body as RESTPostAPIChannelMessageJSONBody
  }

  patchdata: RESTPatchAPIChannelMessageJSONBody
  postdata: RESTPostAPIChannelMessageJSONBody
}

export class RoleData {
  constructor(body: RESTPatchAPIGuildRoleJSONBody) {
    this.patchdata = body
    this.postdata = body as RESTPostAPIGuildRoleJSONBody
  }

  patchdata: RESTPatchAPIGuildRoleJSONBody
  postdata: RESTPostAPIGuildRoleJSONBody
}

export class GuildChannelData {
  /**
   * Data for a guild channel. Can be used for post and patch endpoints.
   * All properties are editable in discord except for type,
   * which only supports conversion between text and announcement.
   * This class omits type from patch data.
   * @param body
   */
  constructor(body: Omit<RESTPatchAPIChannelJSONBody, 'type'> & { type: ChannelType }) {
    this.postdata = body as RESTPostAPIGuildChannelJSONBody
    this.patchdata = {
      ...body,
      type: undefined,
    }
    this.patchdata.type
  }

  patchdata: RESTPatchAPIChannelJSONBody
  postdata: RESTPostAPIGuildChannelJSONBody
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
    return new MessageData({
      content: this.content,
      embeds: this.embeds,
      components: this.components,
    })
  }
}
