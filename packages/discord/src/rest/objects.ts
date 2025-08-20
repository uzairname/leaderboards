import * as D from 'discord-api-types/v10'

/**
 * A message without nonce, tts, message reference, or stickers.
 * All properties are editable in discord.
 * @param body
 */
export class MessageData {
  constructor(public body: D.RESTPatchAPIChannelMessageJSONBody) {
    // this.patch_data =
    // this.post_data = body as D.RESTPostAPIChannelMessageJSONBody
    // this.response_data = {
    //   content: body.content ?? undefined,
    //   embeds: body.embeds ?? undefined,
    //   components: body.components ?? undefined,
    // }
  }

  addFlags(flags: D.MessageFlags) {
    this.body.flags = (this.body.flags ?? 0) | flags
    return this
  }

  ephemeral() {
    return this.addFlags(D.MessageFlags.Ephemeral)
  }

  // post_data: D.RESTPostAPIChannelMessageJSONBody
  // response_data: D.APIInteractionResponseCallbackData

  get patch_data(): D.RESTPatchAPIChannelMessageJSONBody {
    return {
      content: this.body.content ?? null,
      embeds: this.body.embeds ?? null,
      components: this.body.components ?? null,
      ...this.body,
    }
  }

  get post_data(): D.RESTPostAPIChannelMessageJSONBody {
    return this.body as D.RESTPostAPIChannelMessageJSONBody
  }

  get response_data(): D.APIInteractionResponseCallbackData {
    return {
      content: this.body.content ?? ``,
      embeds: this.body.embeds ?? [],
      components: this.body.components ?? [],
      flags: this.body.flags ?? undefined,
    }
  }
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
