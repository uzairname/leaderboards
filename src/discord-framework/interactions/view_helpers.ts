import {
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandAutocompleteResponse,
  APIApplicationCommandInteraction,
  ModalSubmitComponent,
  APIInteractionResponseCallbackData,
  RESTPatchAPIWebhookWithTokenMessageJSONBody,
  InteractionType,
  APIInteractionResponseChannelMessageWithSource,
  APIInteractionResponse,
  InteractionResponseType,
  APIInteraction,
} from 'discord-api-types/v10'
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'

import { StringData, StringDataSchema } from './utils/string_data'

import { sentry } from '../../logging/globals'

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
import { RespondWithCommand, ViewOffloadCallback } from './views'
import { FindViewCallback } from './types'
import { ViewErrorCallback } from './types'
import { replaceMessageComponentsCustomIds } from './utils/interaction_utils'

export async function respondToUserInteraction(
  interaction: APIInteraction,
  bot: DiscordRESTClient,
  find_view_callback: FindViewCallback,
  onError: ViewErrorCallback,
  direct_response: boolean = true,
): Promise<APIInteractionResponse | undefined> {
  /*
  Handle any non-ping interaction. Might return a Response
  */
  try {
    let response: APIInteractionResponse | undefined
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
      let parsed_custom_id = decompressCustomIdUTF16(interaction.data.custom_id)
      let view = await findView(find_view_callback, undefined, parsed_custom_id.prefix)
      sentry.request_name = `${
        isCommandView(view) ? view.options.command.name : view.options.custom_id_prefix
      } Component`
      response = await respondToViewComponentInteraction(
        view,
        interaction,
        parsed_custom_id.content,
        bot,
        onError,
      )
    } else {
      throw new Error(`Unknown interaction type ${interaction.type}`)
    }

    sentry.addBreadcrumb({
      category: 'interaction',
      message: 'Responding to interaction',
      level: 'info',
      data: {
        response: JSON.stringify(response),
      },
    })

    if (direct_response) {
      return response
    } else if (response) {
      await bot.createInteractionResponse(interaction.id, interaction.token, response)
    }
  } catch (e) {
    await bot.createInteractionResponse(interaction.id, interaction.token, onError(e))
  }
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
    offload: (callback) => {
      sentry.waitUntil(
        executeViewOffloadCallback({
          callback,
          onError,
          view,
          bot,
          interaction,
          state,
        }),
      )
    },
    _ctx: {
      bot,
      onError,
    },
    state,
  })

  let response: CommandInteractionResponse
  if (result instanceof RespondWithCommand) {
    response = result.response
    replaceResponseCustomIds(response, compressCustomIdUTF16(result.command))
  } else {
    response = result
    replaceResponseCustomIds(response, compressCustomIdUTF16(view))
  }

  return response
}

type DecodedCustomId = {
  prefix: string
  content: EncodedCustomIdState
}

class EncodedCustomIdState extends String {}

export async function respondToViewComponentInteraction(
  view: AnyView,
  interaction: ComponentInteraction,
  custom_id_state: EncodedCustomIdState,
  bot: DiscordRESTClient,
  onError: (e: unknown) => APIInteractionResponseChannelMessageWithSource,
): Promise<ChatInteractionResponse | undefined> {
  if (!view._componentCallback) throw new ViewErrors.NoComponentCallback()

  const state = decodeViewCustomIdState(view, custom_id_state)

  var result = await view._componentCallback({
    interaction,
    offload: (callback) => {
      sentry.waitUntil(
        executeViewOffloadCallback({
          view,
          callback,
          bot,
          interaction,
          state,
          onError,
        }),
      )
    },
    _ctx: {
      bot,
      onError,
    },
    state,
  })

  if (!result) return
  replaceResponseCustomIds(result, compressCustomIdUTF16(view))
  return result
}

export async function executeViewOffloadCallback(args: {
  view: AnyView
  callback: ViewOffloadCallback<any>
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
        replaceMessageComponentsCustomIds(
          response_data.components,
          compressCustomIdUTF16(args.view),
        )
        await args.bot.followupInteractionResponse(args.interaction.token, response_data)
      },
      editOriginal: async (data: RESTPatchAPIWebhookWithTokenMessageJSONBody) => {
        replaceMessageComponentsCustomIds(data.components, compressCustomIdUTF16(args.view))
        await args.bot.editOriginalInteractionResponse(args.interaction.token, data)
      },
      state: args.state,
      _ctx: {
        bot: args.bot,
        onError: args.onError,
      },
    })
  } catch (e) {
    let response_data = args.onError(e).data
    if (!response_data) return
    replaceMessageComponentsCustomIds(response_data.components, compressCustomIdUTF16(args.view))
    await args.bot.followupInteractionResponse(args.interaction.token, response_data)
  }
}

export async function getMessageViewMessageData<Param>(
  view: AnyMessageView,
  params: Param,
): Promise<MessageData> {
  let message = await view._initCallback(
    {
      state: decodeViewCustomIdState(view),
    },
    params,
  )

  let message_json = message.patchdata
  replaceMessageComponentsCustomIds(message_json.components, compressCustomIdUTF16(view))
  return new MessageData(message_json)
}

function decodeViewCustomIdState<Schema extends StringDataSchema>(
  view: AnyView,
  data?: EncodedCustomIdState,
): StringData<Schema> {
  let state = new StringData(view.options.state_schema).decode(data?.valueOf() || '')
  let data_temp = state.data.valueOf()
  sentry.addBreadcrumb({
    category: 'interaction',
    message: 'Decoded custom id state',
    level: 'debug',
    data: {
      'custom id': data?.valueOf(),
      'decoded state': data_temp,
    },
  })
  return state
}

const CUSTOM_ID_PREFIX = '0'

export function compressCustomIdUTF16(view: AnyView): (str?: EncodedCustomIdState) => string {
  return (str?: EncodedCustomIdState) => {
    let custom_id: string
    custom_id = `${view.options.custom_id_prefix}.${str || ''}`
    custom_id = CUSTOM_ID_PREFIX + custom_id
    custom_id = compressToUTF16(custom_id)
    if (custom_id.length > 100) throw new ViewErrors.CustomIdTooLong(custom_id)
    return custom_id
  }
}

export function decompressCustomIdUTF16(custom_id: string): DecodedCustomId {
  let decompressed_custom_id = decompressFromUTF16(custom_id)

  if (!decompressed_custom_id)
    throw new ViewErrors.InvalidEncodedCustomId(`Unable to decode custom id ${custom_id}`)

  if (!decompressed_custom_id.startsWith(CUSTOM_ID_PREFIX)) {
    throw new ViewErrors.InvalidEncodedCustomId(
      `${decompressed_custom_id} doesn't start with ${CUSTOM_ID_PREFIX}`,
    )
  }

  let [view_class, ...extra] = decompressed_custom_id.slice(1).split('.')
  return {
    prefix: view_class,
    content: new EncodedCustomIdState(extra.join('.')),
  }
}

export function replaceResponseCustomIds(
  response: APIInteractionResponse,
  replace: (data?: string) => string,
): void {
  // replaces all instances of a custom_id in a discord interaction response with replace(custom_id)
  if (
    response.type === InteractionResponseType.ChannelMessageWithSource ||
    response.type === InteractionResponseType.UpdateMessage ||
    response.type === InteractionResponseType.Modal
  ) {
    replaceMessageComponentsCustomIds(response.data?.components, replace)
  }

  if (response.type === InteractionResponseType.Modal) {
    response.data.custom_id = replace(response.data.custom_id)
  }
}
