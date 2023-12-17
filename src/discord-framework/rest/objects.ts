import * as D from 'discord-api-types/v10'

export class MessageData {
  /**
   * A message without nonce, tts, message reference, or stickers.
   * All properties are editable in discord.
   * @param body
   */
  constructor(body: D.RESTPatchAPIChannelMessageJSONBody) {
    this.patchdata = body
    this.postdata = body as D.RESTPostAPIChannelMessageJSONBody
  }

  patchdata: D.RESTPatchAPIChannelMessageJSONBody
  postdata: D.RESTPostAPIChannelMessageJSONBody
}

export class RoleData {
  constructor(body: D.RESTPatchAPIGuildRoleJSONBody) {
    this.patchdata = body
    this.postdata = body as D.RESTPostAPIGuildRoleJSONBody
  }

  patchdata: D.RESTPatchAPIGuildRoleJSONBody
  postdata: D.RESTPostAPIGuildRoleJSONBody
}

export class GuildChannelData {
  /**
   * Data for a guild channel. Can be used for post and patch endpoints.
   * All properties are editable in discord except for type,
   * which only supports conversion between text and announcement.
   * This class omits type from patch data.
   * @param body
   */
  constructor(body: Omit<D.RESTPatchAPIChannelJSONBody, 'type'> & { type: D.ChannelType }) {
    this.postdata = body as D.RESTPostAPIGuildChannelJSONBody
    this.patchdata = {
      ...body,
      type: undefined
    }
    this.patchdata.type
  }

  patchdata: D.RESTPatchAPIChannelJSONBody
  postdata: D.RESTPostAPIGuildChannelJSONBody
}

export class MessageBuilder {
  content?: string
  embeds?: D.APIEmbed[]
  components?: []

  constructor(params?: { content: string; embeds: D.APIEmbed[]; component: [] }) {
    this.content = params?.content
    this.embeds = params?.embeds
    this.components = params?.component
  }

  message() {
    return new MessageData({
      content: this.content,
      embeds: this.embeds,
      components: this.components
    })
  }
}
