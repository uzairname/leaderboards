import * as D from 'discord-api-types/v10'
import { json } from 'itty-router'
import { DiscordAPIClient } from '../..'
import { DiscordLogger } from '../../logging/discord-logger'
import { InteractionErrors } from '../errors'
import {
  FindViewCallback,
  InteractionErrorCallback,
  OffloadCallback,
  viewIsChatInputCommand,
  viewIsCommand,
} from '../types'
import { findView } from './find-view'
import { verify } from './verify'
import { ViewStateFactory } from './view-state'

export async function respondToInteraction(
  bot: DiscordAPIClient,
  request: Request,
  findViewCallback: FindViewCallback,
  onError: InteractionErrorCallback,
  offload: OffloadCallback,
  direct_response = true,
  logger?: DiscordLogger,
): Promise<Response> {
  if (!(await verify(request, bot.public_key))) {
    logger?.log({ message: 'Invalid signature' })
    return new Response('Invalid signature', { status: 401 })
  }

  const interaction = (await request.json()) as D.APIInteraction

  const response = await respond(interaction, bot, findViewCallback, onError, offload, logger)
    .then(res => res)
    .catch(e => onError(e))

  logger?.log({
    message: 'Responding with',
    data: { response: JSON.stringify(response), direct_response },
  })

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
  offload: OffloadCallback,
  logger?: DiscordLogger,
): Promise<D.APIInteractionResponse> {
  if (interaction.type === D.InteractionType.Ping) return { type: D.InteractionResponseType.Pong }

  logInteraction(interaction)

  if (
    interaction.type === D.InteractionType.ApplicationCommand ||
    interaction.type === D.InteractionType.ApplicationCommandAutocomplete
  ) {
    const view = findView(findViewCallback, interaction)

    if (interaction.type === D.InteractionType.ApplicationCommand) {
      if (viewIsCommand(view))
        return view.respondToCommand(
          interaction as any /** TODO: fix type */,
          bot,
          onError,
          offload,
          logger,
        )
      throw new InteractionErrors.InvalidViewType()
    }

    if (interaction.type === D.InteractionType.ApplicationCommandAutocomplete) {
      if (viewIsChatInputCommand(view)) return view.respondToAutocomplete(interaction, logger)
      throw new InteractionErrors.InvalidViewType()
    }
  }

  const { view, state } = ViewStateFactory.fromCustomId(
    interaction.data.custom_id,
    (custom_id_prefix: string) => {
      return findView(findViewCallback, undefined, custom_id_prefix)
    },
    logger,
  )

  return view.respondToComponent(interaction, state, bot, onError, offload, logger)
}

function logInteraction(interaction: D.APIInteraction, logger?: DiscordLogger) {
  logger?.setUser({
    id: interaction.user?.id ?? interaction.member?.user.id,
    username: interaction.user?.username ?? interaction.member?.user.username,
    guild: interaction.guild_id,
  })

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

  logger?.log({
    message: 'Received Interaction',
    data,
  })
}
