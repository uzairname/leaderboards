import {
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandAutocompleteResponse,
  APIApplicationCommandInteraction,
  APIInteractionResponseCallbackData,
  RESTPatchAPIWebhookWithTokenMessageJSONBody,
  InteractionType,
  APIInteractionResponseChannelMessageWithSource,
  APIInteractionResponse,
  InteractionResponseType,
  APIInteraction,
  ComponentType,
} from 'discord-api-types/v10'
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'

import { StringData, StringDataSchema, StringField } from '../../utils/string_data'

import { sentry } from '../../request/sentry'

import { MessageData } from '../rest/objects'
import { DiscordRESTClient } from '../rest/client'

import {
  ChatInputCommandView,
  AnyCommandView,
  CommandInteractionResponse,
  AnyView,
  ComponentInteraction,
  ChatInteractionResponse,
  ChatInteraction,
  isCommandView,
  isChatInputCommandView,
  AnyMessageView,
} from './types'
import { ViewErrors } from './utils/errors'
import { DeferResponseConfirmation, ViewDeferCallback } from './views'
import { FindViewCallback } from './types'
import { InteractionErrorCallback } from './types'
import { replaceMessageComponentsCustomIdsInPlace } from './utils/interaction_utils'
import { cloneSimpleObj } from '../../utils/utils'

export class ViewState<T extends StringDataSchema> extends StringData<T> {
  static create<View extends AnyView>(view: View): ViewState<View['options']['state_schema']> {
    return new ViewState(view, view.options.state_schema)
  }

  static async getFromCustomId(
    custom_id: string,
    findViewCallback: FindViewCallback,
  ): Promise<{ view: AnyView; state: ViewState<StringDataSchema> }> {
    let decompressed_custom_id = decompressFromUTF16(custom_id)
    sentry.debug(`decompressed not decoded ${decompressed_custom_id}`)

    if (!decompressed_custom_id)
      throw new ViewErrors.InvalidEncodedCustomId(`Unable to decode custom id ${custom_id}`)

    const [prefix, ...extra] = decompressed_custom_id.split('.')
    const encoded_data = extra.join('.') as EncodedCustomIdData

    let view = await findView(findViewCallback, undefined, prefix)

    let state = new ViewState(view, view.options.state_schema).decode(encoded_data || '')

    return { view, state }
  }

  set = {} as {
    [K in keyof T]: (value: T[K]['default_value']) => ViewState<T>
  }

  cId(data: { [K in keyof T]?: T[K]['default_value'] }): string {
    let temp = new ViewState(this.view, this.schema)
    temp.data = Object.entries(data).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = this.validateAndCompress(key, value)
      }
      return acc
    }, {} as any)
    return temp.encode()
  }

  private constructor(private view: AnyView, protected schema: T) {
    sentry.debug(`creating state for ${view.options.custom_id_prefix}`)
    super(view.options.state_schema)

    for (const key in this.schema) {
      this.set[key] = (value: T[typeof key]['default_value']) => {
        let temp = new ViewState(this.view, this.schema)
        temp.data = {
          ...this.data,
        }
        temp.data[key] = this.validateAndCompress(key, value)
        return temp
      }
    }
  }

  encode(): string {
    let encoded = super.encode()
    encoded = `${this.view.options.custom_id_prefix}.${encoded}`
    sentry.debug(`encoded not compressed ${encoded}`)
    encoded = compressToUTF16(encoded)
    if (encoded.length > 100) throw new ViewErrors.CustomIdTooLong(encoded)
    return encoded
  }
}

export async function respondToUserInteraction(
  interaction: APIInteraction,
  bot: DiscordRESTClient,
  find_view_callback: FindViewCallback,
  onError: InteractionErrorCallback,
  direct_response: boolean = true,
): Promise<APIInteractionResponse | undefined> {
  /*
  Handle any non-ping interaction. Might return a Response
  */

  let response: APIInteractionResponse | undefined

  sentry.setExtra(
    'interaction user',
    interaction.user?.username ?? interaction.member?.user.username ?? undefined,
  )

  try {
    if (
      interaction.type === InteractionType.ApplicationCommand ||
      interaction.type === InteractionType.ApplicationCommandAutocomplete
    ) {
      let view = await findView(find_view_callback, interaction)
      if (interaction.type === InteractionType.ApplicationCommand && isCommandView(view)) {
        // view must be a command view if it's an application command interaction
        sentry.request_name = `${interaction.data.name} Command`
        response = await respondToViewCommandInteraction(view, interaction, bot, onError)
      } else if (
        interaction.type === InteractionType.ApplicationCommandAutocomplete &&
        isChatInputCommandView(view)
      ) {
        // view must be a chat input command view if it's an autocomplete interaction
        sentry.request_name = `${interaction.data.name} Autocomplete`
        response = await respondToViewAutocompleteInteraction(view, interaction)
      }
    } else if (
      interaction.type === InteractionType.MessageComponent ||
      interaction.type === InteractionType.ModalSubmit
    ) {
      // view can be any view if it's a component interaction
      // let parsed_custom_id = parseCustomId(interaction.data.custom_id)
      // let view = await findView(find_view_callback, undefined, parsed_custom_id.view_id)
      let { view, state } = await ViewState.getFromCustomId(
        interaction.data.custom_id,
        find_view_callback,
      )
      sentry.request_name = `${
        isCommandView(view) ? view.options.command.name : view.options.custom_id_prefix
      } Component`
      response = await respondToViewComponentInteraction(
        view,
        state,
        interaction,
        // parsed_custom_id.encoded_data,
        bot,
        onError,
      )
    }
  } catch (e) {
    response = onError(e)
  }

  sentry.addBreadcrumb({
    category: 'interaction',
    level: 'info',
    message: 'Responding to interaction request',
    data: {
      response,
    },
  })

  if (!direct_response && response) {
    return void (await bot.createInteractionResponse(interaction.id, interaction.token, response))
  }
  return response
}

async function findView(
  find_view_callback: FindViewCallback,
  command_interaction?:
    | APIApplicationCommandInteraction
    | APIApplicationCommandAutocompleteInteraction,
  custom_id_prefix?: string,
) {
  const view = await find_view_callback(
    command_interaction
      ? {
          name: command_interaction.data.name,
          type: command_interaction.data.type,
          guild_id: command_interaction.data.guild_id,
        }
      : undefined,
    custom_id_prefix,
  )
  if (!view) throw new ViewErrors.UnknownView()
  return view
}

export async function respondToViewAutocompleteInteraction(
  view: ChatInputCommandView,
  interaction: APIApplicationCommandAutocompleteInteraction,
): Promise<APIApplicationCommandAutocompleteResponse> {
  if (!view._autocompleteCallback) throw new ViewErrors.AutocompleteNotImplemented()
  let result = await view._autocompleteCallback({ interaction })
  return result
}

export async function respondToViewCommandInteraction(
  view: AnyCommandView,
  interaction: APIApplicationCommandInteraction,
  bot: DiscordRESTClient,
  onError: (e: unknown) => APIInteractionResponseChannelMessageWithSource,
): Promise<CommandInteractionResponse> {
  // const state = decodeViewCustomIdState(view)
  const state = ViewState.create(view)

  var result = await view._commandCallback({
    interaction: interaction as any,
    defer: (response, callback) => {
      sentry.waitUntil(
        executeViewDeferCallback({
          view,
          callback,
          interaction,
          state,
          bot,
          onError,
        }),
      )
      return response
    },
    state,
    // _ctx: { bot, onError },
  })

  // result = replaceResponseCustomIds(result, compressCustomIdUTF16(view))
  return result
}

type EncodedCustomIdData = string

export async function respondToViewComponentInteraction(
  view: AnyView,
  state: ViewState<any>,
  interaction: ComponentInteraction,
  // custom_id_state: EncodedCustomIdData,
  bot: DiscordRESTClient,
  onError: (e: unknown) => APIInteractionResponseChannelMessageWithSource,
): Promise<ChatInteractionResponse> {
  if (!view._componentCallback) throw new ViewErrors.ComponentCallbackNotImplemented()

  // const state = decodeViewCustomIdState(view, custom_id_state)

  var result = await view._componentCallback({
    interaction,
    defer: (initial_response, callback) => {
      sentry.waitUntil(
        executeViewDeferCallback({
          view,
          callback,
          interaction,
          state,
          bot,
          onError,
        }),
      )
      return initial_response
    },
    state,
    // _ctx: { bot, onError },
  })

  // result = replaceResponseCustomIds(result, compressCustomIdUTF16(view))
  return result
}

export async function executeViewDeferCallback(args: {
  view: AnyView
  callback: ViewDeferCallback<any>
  interaction: ChatInteraction
  state: ViewState<StringDataSchema>
  bot: DiscordRESTClient
  onError: (e: unknown) => APIInteractionResponseChannelMessageWithSource
}): Promise<void> {
  sentry.debug(`executing offload callback for ${args.view.options.custom_id_prefix}`)

  try {
    await args.callback({
      interaction: args.interaction,
      followup: async (response_data: APIInteractionResponseCallbackData) => {
        await args.bot.followupInteractionResponse(args.interaction.token, response_data)
        return new DeferResponseConfirmation()
      },
      editOriginal: async (data: RESTPatchAPIWebhookWithTokenMessageJSONBody) => {
        await args.bot.editOriginalInteractionResponse(args.interaction.token, data)
        return new DeferResponseConfirmation()
      },
      // delete: async () => {
      //   await args.bot.deleteOriginalInteractionResponse(args.interaction.token)
      //   return new DeferResponseConfirmation()
      // },
      ignore: () => new DeferResponseConfirmation(),
      state: args.state,
      // _ctx: { bot: args.bot, onError: args.onError },
    })
  } catch (e) {
    let error_response = args.onError(e).data
    if (error_response) {
      await args.bot.followupInteractionResponse(args.interaction.token, error_response)
    }
  }
}

export async function getMessageViewMessageData(
  view: AnyMessageView,
  params: object,
): Promise<MessageData> {

  let message = await view._initCallback({
    state: ViewState.create(view),
    ...params,
  })

  let message_json = message.patchdata
  return new MessageData(message_json)
}
