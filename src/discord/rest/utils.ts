import * as D from 'discord-api-types/v10'
import { DiscordRESTClient } from './client'
import { DiscordErrors } from './errors'
import { Message, RESTPostAPIGuildForumThreadsResult } from './message'
import { DiscordAPIError } from '@discordjs/rest'
import { sentry } from '../../utils/globals'

export class DiscordRESTUtils {
  readonly bot: DiscordRESTClient

  constructor(bot: DiscordRESTClient) {
    this.bot = bot
  }

  async haveRole(params: {
    guild_id: string
    possible_role_id?: string | null
    new_role_data: () => Promise<D.RESTPostAPIGuildRoleJSONBody>
    update_role_data?: () => Promise<D.RESTPostAPIGuildRoleJSONBody>
  }): Promise<{
    role: D.APIRole
    is_new_role: boolean
  }> {
    try {
      if (params.update_role_data && params.possible_role_id) {
        // Try to edit the role
        const body = await params.update_role_data()
        let role = await this.bot.editRole(params.guild_id, params.possible_role_id, body)
        return {
          role,
          is_new_role: false,
        }
      } else if (params.possible_role_id) {
        // Don't edit the role. Return if it exists.
        let roles = await this.bot.getRoles(params.guild_id)
        let role = roles.find((role) => role.id === params.possible_role_id)
        if (role)
          return {
            role,
            is_new_role: false,
          }
      }
    } catch (e) {
      if (!(e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownRole)) {
        throw e
      }
    }
    // role doesn't exist
    let new_role = await this.bot.makeRole(params.guild_id, await params.new_role_data())
    return {
      role: new_role,
      is_new_role: true,
    }
  }

  async dontHaveRole(params: {
    guild_id: string
    possible_role_id?: string | null
  }): Promise<D.APIRole | void> {
    try {
      if (!params.possible_role_id) return
      return await this.bot.deleteRole(params.guild_id, params.possible_role_id)
    } catch (e) {
      if (!(e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownRole)) {
        throw e
      }
    }
  }

  async haveGuildChannel(params: {
    possible_channel_id?: string | null
    update_channel_data?: () => Promise<D.RESTPatchAPIChannelJSONBody>
    new_channel_data: () => Promise<{
      guild_id: string
      body: D.RESTPostAPIGuildChannelJSONBody
    }>
  }): Promise<{
    channel: D.APIChannel
    is_new_channel: boolean
  }> {
    try {
      if (params.update_channel_data && params.possible_channel_id) {
        // try to edit the channel
        const body = await params.update_channel_data()
        const channel = (await this.bot.editGuildChannel(
          params.possible_channel_id,
          body,
        )) as D.APIChannel
        return {
          channel,
          is_new_channel: false,
        }
      } else if (params.possible_channel_id) {
        // don't edit the channel. Return if it exists.
        sentry.debug(`getting channel ${params.possible_channel_id}`)
        const channel = (await this.bot.getChannel(params.possible_channel_id)) as D.APIChannel
        return {
          channel,
          is_new_channel: false,
        }
      } else {
        // existing channel unspecified
      }
    } catch (e) {
      if (e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownChannel) {
        // channel doesn't exist
      } else {
        throw e
      }
    }

    const { guild_id, body } = await params.new_channel_data()
    return {
      channel: await this.bot.makeGuildChannel(guild_id, body),
      is_new_channel: true,
    }
  }

  async dontHaveChannel(params: {
    possible_channel_id?: string | null
  }): Promise<D.APIChannel | void> {
    try {
      if (!params.possible_channel_id) return
      return await this.bot.deleteChannel(params.possible_channel_id)
    } catch (e) {
      if (!(e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownChannel)) {
        throw e
      }
    }
  }

  async haveChannelMessage(params: {
    possible_channel_id?: string | null
    possible_message_id?: string | null
    message: () => Promise<Message>
    new_channel: () => Promise<{
      guild_id: string
      body: D.RESTPostAPIGuildChannelJSONBody
    }>
    edit_message_if_exists?: boolean
  }): Promise<{
    message: D.APIMessage
    is_new_message: boolean
    new_channel?: D.APIChannel
  }> {
    let new_channel: D.APIChannel | undefined = undefined
    try {
      if (
        params.edit_message_if_exists &&
        params.possible_channel_id &&
        params.possible_message_id
      ) {
        // Try to edit the message
        const msg = await params.message()
        let existing_message = await this.bot.editMessage(
          params.possible_channel_id,
          params.possible_message_id,
          msg.patchdata,
        )
        sentry.debug('successfully edited message', JSON.stringify(existing_message))
        return {
          message: existing_message,
          is_new_message: false,
        }
      } else if (params.possible_channel_id) {
        // Don't edit the message. Return if it exists.
        // Either channel or message might exist
        let existing_message = await this.bot.getMessage(
          params.possible_channel_id,
          params.possible_message_id || '0',
        )
        return { message: existing_message, is_new_message: false }
      } else {
        // neither channel nor message was provided
        new_channel = (
          await this.haveGuildChannel({
            new_channel_data: params.new_channel,
          })
        ).channel
      }
    } catch (e) {
      if (e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownChannel) {
        // channel doesn't exist
        new_channel = (
          await this.haveGuildChannel({
            new_channel_data: params.new_channel,
          })
        ).channel
      } else if (e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.UnknownMessage) {
        // channel exists, but message doesn't
      } else {
        throw e
      }
    }
    // channel exists, but message doesn't

    const msg = await params.message()
    let new_message = await this.bot.createMessage(
      new_channel?.id || params.possible_channel_id!,
      msg.postdata,
    )
    return {
      message: new_message,
      is_new_message: true,
      new_channel,
    }
  }

  async haveThread(params: {
    possible_thread_id?: string | null
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
      if (params.possible_thread_id) {
        // Don't edit the thread. Return if it exists.
        let thread = await this.bot.getChannel(params.possible_thread_id)
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
    let new_thread = await this.bot.makePublicThread(
      new_thread_data.body,
      new_thread_data.channel.id,
      params.message.id,
    )

    return {
      thread: new_thread,
      is_new_thread: true,
    }
  }

  async haveForumPost(params: {
    possible_thread_id?: string | null
    possible_message_id?: string | null
    update_message?: () => Promise<D.RESTPatchAPIChannelMessageJSONBody>
    new_post: () => Promise<{
      possible_forum_id?: string | null
      body: D.RESTPostAPIGuildForumThreadsJSONBody
    }>
    new_forum: () => Promise<{
      guild_id: string
      body: D.RESTPostAPIGuildChannelJSONBody
    }>
  }): Promise<{
    message: D.APIMessage
    thread_id: string
    new_post?: RESTPostAPIGuildForumThreadsResult
    new_forum?: D.APIChannel
  }> {
    // Makes sure an original message with the provided data exists in the provided thread, or forum.
    // If thread exists without the message, thread is deleted and recreated.

    try {
      if (params.update_message && params.possible_thread_id && params.possible_message_id) {
        // Try to edit the message
        const body = await params.update_message()
        let message = await this.bot.editMessage(
          params.possible_thread_id,
          params.possible_message_id,
          body,
        )
        return {
          message,
          thread_id: params.possible_thread_id,
        }
      } else if (params.possible_thread_id) {
        // Don't edit. Return if it exists.
        let message = await this.bot.getMessage(
          params.possible_thread_id,
          params.possible_message_id || '0',
        )
        return {
          message,
          thread_id: params.possible_thread_id,
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
          await this.bot.deleteThread(params.possible_thread_id || '0')
        }
        // thread and message don't exist
      } else {
        throw e
      }
    }
    // thread and message don't exist

    let { possible_forum_id, body } = await params.new_post()
    try {
      if (possible_forum_id) {
        let new_post = await this.bot.makeForumPost(possible_forum_id, body)
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

    try {
      var new_forum = (
        await this.haveGuildChannel({
          new_channel_data: params.new_forum,
        })
      ).channel
    } catch (e) {
      if (
        e instanceof DiscordAPIError &&
        e.code === D.RESTJSONErrorCodes.CannotExecuteActionOnThisChannelType
      ) {
        throw new DiscordErrors.ForumInNonCommunityServer()
      } else {
        throw e
      }
    }

    let new_post = await this.bot.makeForumPost(new_forum.id, body)
    return {
      message: new_post.message,
      new_post: new_post,
      new_forum,
      thread_id: new_post.id,
    }
  }
}
