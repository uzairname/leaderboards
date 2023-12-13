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
  APIModalInteractionResponse,
} from 'discord-api-types/v10'
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'

import { StringData, StringDataSchema } from '../../utils/string_data'

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
import { ViewErrorCallback } from './types'
import { replaceMessageComponentsCustomIdsInPlace } from './utils/interaction_utils'
import { assert, cloneSimpleObj, nonNullable } from '../../utils/utils'

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
  sentry.setExtra(
    'username',
    interaction.user?.username ?? interaction.member?.user.username ?? undefined,
  )

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
    } else {
      throw new Error('No response to interaction')
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
    defer: (response, callback) => {
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
      return response
    },
    _ctx: {
      bot,
      onError,
    },
    state,
  })

  result = replaceResponseCustomIds(result, compressCustomIdUTF16(view))
  return result
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
): Promise<ChatInteractionResponse> {
  if (!view._componentCallback) throw new ViewErrors.NoComponentCallback()

  const state = decodeViewCustomIdState(view, custom_id_state)

  var result = await view._componentCallback({
    interaction,
    defer: (initial_response, callback) => {
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
      return initial_response
    },
    _ctx: {
      bot,
      onError,
    },
    state,
  })

  result = replaceResponseCustomIds(result, compressCustomIdUTF16(view))
  return result
}

export async function executeViewOffloadCallback(args: {
  view: AnyView
  callback: ViewDeferCallback<any>
  interaction: ChatInteraction
  state: StringData<any>
  bot: DiscordRESTClient
  onError: (e: unknown) => APIInteractionResponseChannelMessageWithSource
}): Promise<void> {
  sentry.debug(`executing offload callback for ${args.view.options.custom_id_prefix}`)

  try {
    const confirmation = await args.callback({
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
      ignore: () => new DeferResponseConfirmation(),
      state: args.state,
      _ctx: {
        bot: args.bot,
        onError: args.onError,
      },
    })
  } catch (e) {
    let error_response = args.onError(e).data
    if (!error_response) {return} 
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
  let message = await view._initCallback(
    {
      state: decodeViewCustomIdState(view),
    },
    params,
  )

  let message_json = message.patchdata
  replaceMessageComponentsCustomIdsInPlace(message_json.components, compressCustomIdUTF16(view))
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
