import * as D from 'discord-api-types/v10'

/**
 * A message without nonce, tts, message reference, or stickers.
 * All properties are editable in discord.
 * @param body
 */
export class MessageData {
  constructor(body: D.RESTPatchAPIChannelMessageJSONBody) {
    this.patchdata = {
      content: body.content ?? null,
      embeds: body.embeds ?? null,
      components: body.components ?? null,
      ...body,
    }
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

/**
 * Data for a guild channel. Can be used for post and patch endpoints.
 * All properties are editable in discord except for type,
 * which only supports conversion between text and announcement.
 * This class omits type from patch data.
 * @param body
 */
export class GuildChannelData {
  constructor(body: Omit<D.RESTPatchAPIChannelJSONBody, 'type'> & { type: D.ChannelType }) {
    this.postdata = body as D.RESTPostAPIGuildChannelJSONBody
    this.patchdata = {
      ...body,
      type: undefined,
    }
  }

  patchdata: D.RESTPatchAPIChannelJSONBody
  postdata: D.RESTPostAPIGuildChannelJSONBody
}

export class MessageBuilder {
  content?: string
  embeds?: D.APIEmbed[]
  components?: []

  constructor(params?: { content: string; embeds: D.APIEmbed[]; components: [] }) {
    this.content = params?.content
    this.embeds = params?.embeds
    this.components = params?.components
  }

  message() {
    return new MessageData({
      content: this.content,
      embeds: this.embeds,
      components: this.components,
    })
  }
}
