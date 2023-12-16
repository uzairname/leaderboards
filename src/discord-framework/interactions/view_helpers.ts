import {
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandAutocompleteResponse,
  APIApplicationCommandInteraction,
  APIInteractionResponseCallbackData,
  RESTPatchAPIWebhookWithTokenMessageJSONBody,
  InteractionType,
  APIInteractionResponseChannelMessageWithSource,
  APIInteractionResponse,
  APIInteraction,
} from 'discord-api-types/v10'

import { StringDataSchema } from '../../utils/string_data'
import { sentry } from '../../request/sentry'

import { MessageData } from '../rest/objects'
import { DiscordRESTClient } from '../rest/client'

import {
  AnyView,
  AnyCommandView,
  isCommandView,
  ChatInputCommandView,
  isChatInputCommandView,
  AnyMessageView,
  ComponentInteraction,
  ChatInteraction,
  ChatInteractionResponse,
  CommandInteractionResponse,
} from './types'
import { ViewErrors } from './utils/errors'
import { DeferCallback } from './types'
import { FindViewCallback } from './types'
import { InteractionErrorCallback } from './types'
import { ViewState } from './view_state'

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
        response = await view.receiveCommand(interaction, bot, onError)
      } else if (
        interaction.type === InteractionType.ApplicationCommandAutocomplete &&
        isChatInputCommandView(view)
      ) {
        response = await view.receiveAutocompleteInteraction(interaction)
      }
    } else if (
      interaction.type === InteractionType.MessageComponent ||
      interaction.type === InteractionType.ModalSubmit
    ) {
      let { view, state } = await ViewState.decode(interaction.data.custom_id, find_view_callback)
      response = await view.respondToComponentInteraction(interaction, state, bot, onError)
    }
  } catch (e) {
    response = onError(e)
  }

  sentry.addBreadcrumb({
    category: 'response',
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

export async function findView(
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
