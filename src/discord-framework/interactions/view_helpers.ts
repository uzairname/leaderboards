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
    return new ViewState(view)
  }

  static async getFromCustomId(
    custom_id: string,
    findViewCallback: FindViewCallback,
  ): Promise<ViewState<StringDataSchema>> {
    let decompressed_custom_id = decompressFromUTF16(custom_id)

    if (!decompressed_custom_id)
      throw new ViewErrors.InvalidEncodedCustomId(`Unable to decode custom id ${custom_id}`)

    let { view_id: prefix, encoded_data } = parseCustomId(custom_id || '')

    let view = await findView(findViewCallback, undefined, prefix)

    let state = new ViewState(view).decode(encoded_data || '')

    return state
  }

  private constructor(private view: AnyView) {
    super(view.options.state_schema)
  }

  encode(): string {
    let encoded = super.encode()
    encoded = `${this.view.options.custom_id_prefix}.${encoded}`
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
      let parsed_custom_id = parseCustomId(interaction.data.custom_id)
      let view = await findView(find_view_callback, undefined, parsed_custom_id.view_id)
      sentry.request_name = `${
        isCommandView(view) ? view.options.command.name : view.options.custom_id_prefix
      } Component`
      response = await respondToViewComponentInteraction(
        view,
        interaction,
        parsed_custom_id.encoded_data,
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
  const state = decodeViewCustomIdState(view)

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

  result = replaceResponseCustomIds(result, compressCustomIdUTF16(view))
  return result
}

type EncodedCustomIdData = string

export async function respondToViewComponentInteraction(
  view: AnyView,
  interaction: ComponentInteraction,
  custom_id_state: EncodedCustomIdData,
  bot: DiscordRESTClient,
  onError: (e: unknown) => APIInteractionResponseChannelMessageWithSource,
): Promise<ChatInteractionResponse> {
  if (!view._componentCallback) throw new ViewErrors.ComponentCallbackNotImplemented()

  const state = decodeViewCustomIdState(view, custom_id_state)

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

  result = replaceResponseCustomIds(result, compressCustomIdUTF16(view))
  return result
}

export async function executeViewDeferCallback(args: {
  view: AnyView
  callback: ViewDeferCallback<any>
  interaction: ChatInteraction
  state: StringData<any>
  bot: DiscordRESTClient
  onError: (e: unknown) => APIInteractionResponseChannelMessageWithSource
}): Promise<void> {
  sentry.debug(`executing offload callback for ${args.view.options.custom_id_prefix}`)

  try {
    await args.callback({
      interaction: args.interaction,
      followup: async (response_data: APIInteractionResponseCallbackData) => {
        replaceMessageComponentsCustomIdsInPlace(
          response_data.components,
          compressCustomIdUTF16(args.view),
        )
        await args.bot.followupInteractionResponse(args.interaction.token, response_data)
        return new DeferResponseConfirmation()
      },
      editOriginal: async (data: RESTPatchAPIWebhookWithTokenMessageJSONBody) => {
        replaceMessageComponentsCustomIdsInPlace(data.components, compressCustomIdUTF16(args.view))
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
    if (!error_response) {
      return
    }
    replaceMessageComponentsCustomIdsInPlace(
      error_response.components,
      compressCustomIdUTF16(args.view),
    )
    return void (await args.bot.followupInteractionResponse(args.interaction.token, error_response))
  }
}

export async function getMessageViewMessageData<Param>(
  view: AnyMessageView,
  params: Param,
): Promise<MessageData> {
  const state = decodeViewCustomIdState(view)

  let message = await view._initCallback({
    state,
    ...params,
  })

  let message_json = message.patchdata
  replaceMessageComponentsCustomIdsInPlace(message_json.components, compressCustomIdUTF16(view))
  return new MessageData(message_json)
}

// function decodeViewCustomIdState<Schema extends StringDataSchema>(
//   view: AnyView,
//   data?: EncodedCustomIdData,
// ): StringData<Schema> {
function decodeViewCustomIdState(view: AnyView, data?: EncodedCustomIdData): StringData<any> {
  let state = new StringData(view.options.state_schema).decode(data?.valueOf() || '')
  let state_copy = new StringData(view.options.state_schema).decode(data?.valueOf() || '')
  sentry.addBreadcrumb({
    category: 'interaction',
    level: 'info',
    data: {
      'decoded state': state_copy.data,
    },
  })
  return state
}

export function compressCustomIdUTF16(view: AnyView): (str?: EncodedCustomIdData) => string {
  return (str?: EncodedCustomIdData) => {
    let custom_id: string
    custom_id = `${view.options.custom_id_prefix}.${str || ''}`
    custom_id = compressToUTF16(custom_id)
    if (custom_id.length > 100) throw new ViewErrors.CustomIdTooLong(custom_id)
    return custom_id
  }
}

export function parseCustomId(custom_id: string): {
  view_id: string
  encoded_data: EncodedCustomIdData
} {
  let decompressed_custom_id = decompressFromUTF16(custom_id)

  if (!decompressed_custom_id)
    throw new ViewErrors.InvalidEncodedCustomId(`Unable to decode custom id ${custom_id}`)

  const [view_id, ...extra] = decompressed_custom_id.split('.')
  const encoded_data = extra.join('.') as EncodedCustomIdData

  sentry.addBreadcrumb({
    category: 'custom_id',
    level: 'info',
    data: { custom_id, view_id, encoded_data },
  })

  return {
    view_id,
    encoded_data,
  }
}

export function replaceResponseCustomIds<T extends ChatInteractionResponse>(
  response: T,
  replace: (data?: string) => string,
): typeof response {
  // replaces all instances of a custom_id in a discord interaction response with replace(custom_id)
  const new_response = cloneSimpleObj(response)

  if (
    new_response.type === InteractionResponseType.ChannelMessageWithSource ||
    new_response.type === InteractionResponseType.UpdateMessage ||
    new_response.type === InteractionResponseType.Modal
  ) {
    replaceMessageComponentsCustomIdsInPlace(new_response.data?.components, replace)
  }

  if (new_response.type === InteractionResponseType.Modal) {
    new_response.data.custom_id = replace(new_response.data.custom_id)
  }
  return new_response
}
