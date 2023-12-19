import * as D from 'discord-api-types/v10'
import { json } from 'itty-router'
import { sentry } from '../../request/sentry'
import { DiscordAPIClient } from '../rest/client'
import { findView_ } from './find_view'
import {
  FindViewCallback,
  InteractionErrorCallback,
  isChatInputCommandView,
  isCommandView,
} from './types'
import { ViewErrors } from './utils/errors'
import { verify } from './utils/verify'
import { ViewState } from './view_state'

export async function respondToInteraction(
  bot: DiscordAPIClient,
  request: Request,
  findView: FindViewCallback,
  onError: InteractionErrorCallback,
): Promise<Response> {
  if (!(await verify(request, bot.public_key))) {
    sentry.addBreadcrumb({
      message: 'Invalid signature',
      category: 'discord',
      level: 'info',
    })
    return new Response('Invalid signature', { status: 401 })
  }

  const interaction = (await request.json()) as D.APIInteraction
  const response = await respond(interaction, bot, findView, onError)

  const direct_response = false

  if (direct_response) {
    sentry.addBreadcrumb({
      category: 'response',
      message: 'Sending initial interaction response',
      level: 'info',
      data: { response: JSON.stringify(response) },
    })

    return json(response)
  }

  await bot.createInteractionResponse(interaction.id, interaction.token, response)
  return new Response('OK', { status: 200 })
}

async function respond(
  interaction: D.APIInteraction,
  bot: DiscordAPIClient,
  findView: FindViewCallback,
  onError: InteractionErrorCallback,
): Promise<D.APIInteractionResponse> {
  sentry.setUser({
    id: interaction.user?.id ?? interaction.member?.user.id,
    username: interaction.user?.username ?? interaction.member?.user.username,
    guild: interaction.guild_id,
  })

  try {
    if (interaction.type === D.InteractionType.Ping) return { type: D.InteractionResponseType.Pong }

    if (
      interaction.type === D.InteractionType.ApplicationCommand ||
      interaction.type === D.InteractionType.ApplicationCommandAutocomplete
    ) {
      let view = await findView_(findView, interaction)

      if (interaction.type === D.InteractionType.ApplicationCommand) {
        if (isCommandView(view)) return await view.respondToCommand(interaction, bot, onError)
        throw new ViewErrors.InvalidViewType()
      }

      if (interaction.type === D.InteractionType.ApplicationCommandAutocomplete) {
        if (isChatInputCommandView(view)) return await view.respondToAutocomplete(interaction)
        throw new ViewErrors.InvalidViewType()
      }
    }

    let { view, state } = await ViewState.from(interaction.data.custom_id, findView)
    return await view.respondToComponent(interaction, state, bot, onError)
  } catch (e) {
    return onError(e)
  }
}
