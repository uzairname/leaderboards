import * as D from 'discord-api-types/v10'
import { json } from 'itty-router'
import { Logger, sentry } from '../../request/logging'
import { DiscordAPIClient } from '../rest/client'
import { findView } from './find_view'
import {
  FindViewCallback,
  InteractionErrorCallback,
  viewIsChatInputAppCommand,
  viewIsAppCommand,
} from './types'
import { ViewErrors } from './utils/errors'
import { verify } from './utils/verify'
import { ViewState } from './view_state'

export async function respondToInteraction(
  bot: DiscordAPIClient,
  request: Request,
  findViewCallback: FindViewCallback,
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

  const response = await respond(interaction, bot, findViewCallback, onError)
    .then(res => res)
    .catch(e => onError(e))

  const direct_response = true

  if (direct_response) {
    sentry.addBreadcrumb({
      category: 'response',
      message: 'Sending direct interaction response',
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
  findViewCallback: FindViewCallback,
  onError: InteractionErrorCallback,
): Promise<D.APIInteractionResponse> {
  sentry.setUser({
    id: interaction.user?.id ?? interaction.member?.user.id,
    username: interaction.user?.username ?? interaction.member?.user.username,
    guild: interaction.guild_id,
  })

  if (interaction.type === D.InteractionType.Ping) return { type: D.InteractionResponseType.Pong }

  if (
    interaction.type === D.InteractionType.ApplicationCommand ||
    interaction.type === D.InteractionType.ApplicationCommandAutocomplete
  ) {
    const view = findView(findViewCallback, interaction)

    if (interaction.type === D.InteractionType.ApplicationCommand) {
      if (viewIsAppCommand(view)) return view.respondToCommand(interaction, bot, onError)
      throw new ViewErrors.InvalidViewType()
    }

    if (interaction.type === D.InteractionType.ApplicationCommandAutocomplete) {
      if (viewIsChatInputAppCommand(view)) return view.respondToAutocomplete(interaction)
      throw new ViewErrors.InvalidViewType()
    }
  }

  const { view, state } = ViewState.fromCustomId(interaction.data.custom_id, findViewCallback)
  return view.respondToComponent(interaction, state, bot, onError)
}
