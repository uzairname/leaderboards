import { DiscordAPIError } from '@discordjs/rest'
import * as D from 'discord-api-types/v10'
import { DiscordAPIClient } from './client'
import { GuildChannelData, MessageData, RoleData } from './objects'
import { RESTPostAPIGuildForumThreadsResult } from './types'

export class DiscordAPIUtils {
  readonly bot: DiscordAPIClient

  constructor(bot: DiscordAPIClient) {
    this.bot = bot
  }

  async syncRole(params: {
    guild_id: string
    target_role_id?: string | null
    roleData: () => Promise<RoleData>
  }): Promise<{
    role: D.APIRole
    is_new_role: boolean
  }> {
    try {
      if (params.target_role_id) {
        const edited_role = await this.bot.editRole(
          params.guild_id,
          params.target_role_id,
          (await params.roleData()).patchdata,
        )
        return {
          role: edited_role,
          is_new_role: false,
        }
      }
    } catch (e) {
      if (!(e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownRole)) throw e
    }
    // role doesn't exist
    const new_role = await this.bot.makeRole(params.guild_id, (await params.roleData()).postdata)
    return {
      role: new_role,
      is_new_role: true,
    }
  }

  async deleteRoleIfExists(params: {
    guild_id: string
    target_role_id?: string | null
  }): Promise<D.APIRole | void> {
    try {
      if (!params.target_role_id) return
      return await this.bot.deleteRole(params.guild_id, params.target_role_id)
    } catch (e) {
      if (!(e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownRole)) {
        throw e
      }
    }
  }

  async syncGuildChannel(params: {
    target_channel_id?: string | null
    channelData: () => Promise<{
      guild_id: string
      data: GuildChannelData
      create_reason?: string
    }>
  }): Promise<{
    channel: D.APIChannel
    is_new_channel: boolean
  }> {
    try {
      if (params.channelData && params.target_channel_id) {
        // try to edit the channel
        const { data } = await params.channelData()

        const channel = (await this.bot.editChannel(
          params.target_channel_id,
          data.patchdata,
        )) as D.APIChannel
        return {
          channel,
          is_new_channel: false,
        }
      } else if (params.target_channel_id) {
        // don't edit the channel. Return if it exists.
        const channel = await this.bot.getChannel(params.target_channel_id)
        return {
          channel,
          is_new_channel: false,
        }
      } else {
        // existing channel unspecified
      }
    } catch (e) {
      if (
        e instanceof DiscordAPIError &&
        (e.code === D.RESTJSONErrorCodes.UnknownChannel ||
          e.code === D.RESTJSONErrorCodes.MissingAccess)
      ) {
        // we need to create the channel
      } else {
        throw e
      }
    }

    const { guild_id, data, create_reason: reason } = await params.channelData()
    return {
      channel: await this.bot.createGuildChannel(guild_id, data.postdata, reason),
      is_new_channel: true,
    }
  }

  async deleteChannelIfExists(target_channel_id?: string | null): Promise<D.APIChannel | void> {
    try {
      if (!target_channel_id) return
      return await this.bot.deleteChannel(target_channel_id)
    } catch (e) {
      if (!(e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownChannel)) {
        throw e
      }
    }
  }

  /**
   * Ensures that a message exists in a channel, and creates it if it doesn't.
   * If it exists but no access, creates a new channel and message.
   * @param params.target_channel_id The channel to check for the message in.
   * @param params.target_message_id The message to check for in the channel.
   * @param params.messageData A function that returns the message data to create or edit the message.
   * @param params.channelData A function that returns the channel data to create or edit the channel.
   *                       If unspecified, the channel will be not be created if it doesn't exist.
   * @param params.edit_if_exists Whether to edit the message if it exists.
   */
  async syncChannelMessage(params: {
    target_channel_id?: string | null
    target_message_id?: string | null
    messageData: () => Promise<MessageData>
    channelData?: () => Promise<{
      guild_id: string
      data: GuildChannelData
    }>
    edit_if_exists?: boolean
  }): Promise<{
    message: D.APIMessage
    is_new_message?: boolean
    new_channel?: D.APIChannel
  }> {
    let new_channel: D.APIChannel | undefined = undefined
    try {
      let existing_message: D.APIMessage
      if (params.edit_if_exists) {
        existing_message = await this.bot.editMessage(
          params.target_channel_id || '0',
          params.target_message_id || '0',
          (await params.messageData()).as_patch,
        )
      } else {
        existing_message = await this.bot.getMessage(
          params.target_channel_id || '0',
          params.target_message_id || '0',
        )
      }
      // channel and message exist
      return {
        message: existing_message,
      }
    } catch (e) {
      if (!(e instanceof DiscordAPIError)) throw e
      if ((e.code === D.RESTJSONErrorCodes.UnknownChannel ||
        e.code === D.RESTJSONErrorCodes.MissingAccess) && params.channelData) {
        new_channel = (
          await this.syncGuildChannel({
            channelData: params.channelData,
          })
        ).channel
      } else if (
        !(e.code === D.RESTJSONErrorCodes.UnknownMessage)
      ) {
        throw e
      }
    }
    // channel exists, but message doesn't
    const new_message = await this.bot.createMessage(
      new_channel?.id || params.target_channel_id!,
      (await params.messageData()).as_post,
    )
    return {
      message: new_message,
      is_new_message: true,
      new_channel,
    }
  }

  async haveThread(params: {
    target_thread_id?: string | null
    private?: boolean
    message: D.APIMessage
    new_thread: () => Promise<{
      body: D.RESTPostAPIChannelThreadsJSONBody
      channel: D.APIChannel
    }>
  }): Promise<{
    thread: D.APIChannel
    is_new_thread: boolean
  }> {
    try {
      if (params.target_thread_id) {
        // Don't edit the thread. Return if it exists.
        const thread = await this.bot.getChannel(params.target_thread_id)
        return {
          thread,
          is_new_thread: false,
        }
      }
    } catch (e) {
      if (!(e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownChannel)) {
        throw e
      }
    }
    // channel exists, but thread doesn't

    const new_thread_data = await params.new_thread()
    const new_thread = await this.bot.createPublicThread(
      new_thread_data.body,
      new_thread_data.channel.id,
      params.message.id,
    )

    return {
      thread: new_thread,
      is_new_thread: true,
    }
  }

  async syncForumPost(params: {
    target_thread_id?: string | null
    target_message_id?: string | null
    update_message?: () => Promise<D.RESTPatchAPIChannelMessageJSONBody>
    new_post: () => Promise<{
      target_forum_id?: string | null
      body: D.RESTPostAPIGuildForumThreadsJSONBody
    }>
    new_forum: () => Promise<{
      guild_id: string
      data: GuildChannelData
    }>
  }): Promise<{
    // The message in the post. There is never a new message without a new post.
    message: D.APIMessage
    // the thread id of the post
    thread_id: string
    // the post, if a new one was created
    new_post?: RESTPostAPIGuildForumThreadsResult
    // the forum channel, if a new one was created
    new_forum?: D.APIChannel
  }> {
    // Makes sure an original message with the provided data exists in the provided thread, or forum.
    // If thread exists without the message, thread is deleted and recreated.

    try {
      if (params.update_message && params.target_thread_id && params.target_message_id) {
        // Try to edit the message
        const body = await params.update_message()
        const message = await this.bot.editMessage(
          params.target_thread_id,
          params.target_message_id,
          body,
        )
        return {
          message,
          thread_id: params.target_thread_id,
        }
      } else if (params.target_thread_id) {
        // Don't edit. Return if it exists.
        const message = await this.bot.getMessage(
          params.target_thread_id,
          params.target_message_id || '0',
        )
        return {
          message,
          thread_id: params.target_thread_id,
        }
      } else {
        // thread and message unspecified
      }
    } catch (e) {
      if (
        e instanceof DiscordAPIError &&
        (e.code === D.RESTJSONErrorCodes.UnknownChannel ||
          e.code === D.RESTJSONErrorCodes.UnknownMessage)
      ) {
        if (e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownMessage) {
          // thread exists, without the message
          await this.bot.deleteThread(params.target_thread_id || '0')
        }
        // thread and message don't exist
      } else {
        throw e
      }
    }
    // thread and message don't exist

    const { target_forum_id, body } = await params.new_post()
    try {
      if (target_forum_id) {
        const new_post = await this.bot.createForumPost(target_forum_id, body)
        return {
          message: new_post.message,
          new_post,
          thread_id: new_post.id,
        }
      }
      // forum unspecified
    } catch (e) {
      if (!(e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownChannel)) {
        throw e
      }
      // forum doesn't exist
    }

    const new_forum = (
      await this.syncGuildChannel({
        channelData: params.new_forum,
      })
    ).channel

    const new_post = await this.bot.createForumPost(new_forum.id, body)
    return {
      message: new_post.message,
      new_post: new_post,
      new_forum,
      thread_id: new_post.id,
    }
  }
}
