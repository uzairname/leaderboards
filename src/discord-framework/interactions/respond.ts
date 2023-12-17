import * as D from 'discord-api-types/v10'
import { json } from 'itty-router'
import { sentry } from '../../request/sentry'
import { DiscordRESTClient } from '../rest/client'
import { findView_ } from './find_view'
import {
  FindViewCallback,
  InteractionErrorCallback,
  isChatInputCommandView,
  isCommandView
} from './types'
import { verify } from './utils/verify'
import { ViewState } from './view_state'

export async function respondToDiscordInteraction(
  bot: DiscordRESTClient,
  request: Request,
  getView: FindViewCallback,
  onError: InteractionErrorCallback,
  direct_response: boolean = true
): Promise<Response> {
  if (await verify(request, bot.public_key)) {
    var interaction = (await request.json()) as D.APIInteraction
  } else {
    sentry.addBreadcrumb({
      message: 'Invalid signature',
      category: 'discord',
      level: 'info'
    })
    return new Response('Invalid signature', { status: 401 })
  }

  if (interaction.type === D.InteractionType.Ping) {
    return json({ type: D.InteractionResponseType.Pong })
  } else {
    const response = await respondToUserInteraction(
      interaction,
      bot,
      getView,
      onError,
      direct_response
    )
    return json(response) || new Response(null, { status: 204 })
  }
}

export async function respondToUserInteraction(
  interaction: D.APIInteraction,
  bot: DiscordRESTClient,
  findView: FindViewCallback,
  onError: InteractionErrorCallback,
  direct_response: boolean = true
): Promise<D.APIInteractionResponse | undefined> {
  /*
  Handle any non-ping interaction. Might return a Response
  */
  let response: D.APIInteractionResponse | undefined

  sentry.setExtra(
    'interaction user',
    interaction.user?.username ?? interaction.member?.user.username ?? undefined
  )

  try {
    if (
      interaction.type === D.InteractionType.ApplicationCommand ||
      interaction.type === D.InteractionType.ApplicationCommandAutocomplete
    ) {
      let view = await findView_(findView, interaction)
      if (interaction.type === D.InteractionType.ApplicationCommand) {
        response = isCommandView(view)
          ? await view.respondCommandInteraction(interaction, bot, onError)
          : undefined
      } else if (interaction.type === D.InteractionType.ApplicationCommandAutocomplete) {
        response = isChatInputCommandView(view)
          ? await view.respondAutocompleteInteraction(interaction)
          : undefined
      }
    } else if (
      interaction.type === D.InteractionType.MessageComponent ||
      interaction.type === D.InteractionType.ModalSubmit
    ) {
      let { view, state } = await ViewState.decode(interaction.data.custom_id, findView)
      response = await view.respondComponentInteraction(interaction, state, bot, onError)
    }
  } catch (e) {
    response = onError(e)
  }

  sentry.addBreadcrumb({
    category: 'response',
    level: 'info',
    message: 'Responding to interaction request',
    data: {
      response
    }
  })

  if (!direct_response && response) {
    return void (await bot.createInteractionResponse(interaction.id, interaction.token, response))
  }
  return response
}
