import * as D from 'discord-api-types/v10'
import { json } from 'itty-router'
// import { sentry } from '../../logging/sentry'
import { DiscordAPIClient } from '../rest/client'
import { InteractionErrors } from './errors'
import { findView } from './find-view'
import {
  FindViewCallback,
  InteractionErrorCallback,
  OffloadCallback,
  viewIsChatInputCommand,
  viewIsCommand,
} from './types'
import { verify } from './verify'
import { ViewStateFactory } from './view-state'

export async function respondToInteraction(
  bot: DiscordAPIClient,
  request: Request,
  findViewCallback: FindViewCallback,
  onError: InteractionErrorCallback,
  offload: OffloadCallback,
  direct_response = true,
): Promise<Response> {
  if (!(await verify(request, bot.public_key))) {
    // sentry.addBreadcrumb({
    //   message: 'Invalid signature',
    //   category: 'discord',
    // })
    return new Response('Invalid signature', { status: 401 })
  }

  const interaction = (await request.json()) as D.APIInteraction

  const response = await respond(interaction, bot, findViewCallback, onError, offload)
    .then(res => res)
    .catch(e => onError(e))

  // sentry.addBreadcrumb({
  //   category: 'Responding with',
  //   data: { response: JSON.stringify(response), direct_response },
  // })

  if (direct_response) {
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
  offload: OffloadCallback
): Promise<D.APIInteractionResponse> {
  if (interaction.type === D.InteractionType.Ping) return { type: D.InteractionResponseType.Pong }

  logInteraction(interaction)

  if (
    interaction.type === D.InteractionType.ApplicationCommand ||
    interaction.type === D.InteractionType.ApplicationCommandAutocomplete
  ) {
    const view = findView(findViewCallback, interaction)

    if (interaction.type === D.InteractionType.ApplicationCommand) {
      if (viewIsCommand(view)) return view.respondToCommand(interaction as any, bot, onError, offload) // TODO: fix type
      throw new InteractionErrors.InvalidViewType()
    }

    if (interaction.type === D.InteractionType.ApplicationCommandAutocomplete) {
      if (viewIsChatInputCommand(view)) return view.respondToAutocomplete(interaction)
      throw new InteractionErrors.InvalidViewType()
    }
  }

  const { view, state } = ViewStateFactory.fromCustomId(
    interaction.data.custom_id,
    (custom_id_prefix: string) => {
      return findView(findViewCallback, undefined, custom_id_prefix)
    },
  )

  return view.respondToComponent(interaction, state, bot, onError, offload)
}

function logInteraction(interaction: D.APIInteraction) {
  // sentry.setUser({
  //   id: interaction.user?.username ?? interaction.member?.user.username,
  //   user_id: interaction.user?.id ?? interaction.member?.user.id,
  //   username: interaction.user?.username ?? interaction.member?.user.username,
  //   guild: interaction.guild_id,
  // })

  const data: Record<string, unknown> = {}

  if (interaction.type === D.InteractionType.ApplicationCommand) {
    const options = D.Utils.isChatInputApplicationCommandInteraction(interaction)
      ? interaction.data.options
      : undefined

    data['command_interaction'] = {
      name: interaction.data.name,
      type: interaction.data.type,
      guild_id: interaction.guild_id,
      options: JSON.stringify(options),
    }
  } else if (
    interaction.type === D.InteractionType.MessageComponent ||
    interaction.type === D.InteractionType.ModalSubmit
  ) {
    data['custom_id'] = interaction.data.custom_id
    data['custom_id_length'] = interaction.data.custom_id.length
  }

  // sentry.addBreadcrumb({
  //   message: 'Received Interaction',
  //   category: 'discord',
  //   level: 'info',
  //   data,
  // })
}
