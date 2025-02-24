import { StringDataSchema } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import {
  checkGuildInteraction,
  checkGuildMessageComponentInteraction,
  DiscordAPIClient,
  DiscordLogger,
  InteractionErrors,
  MessageData,
  ViewState,
} from '../..'
import type {
  AnyCommandSignature,
  AnyViewSignature,
  AppCommandInteraction,
  AutocompleteContext,
  ChatInteraction,
  ChatInteractionResponse,
  CommandContext,
  CommandInteractionResponse,
  ComponentCallback,
  ComponentInteraction,
  DeferCallback,
  InteractionErrorCallback,
  InteractionResponse,
  OffloadCallback,
  ViewAutocompleteCallback,
} from '../types'

export interface Handler<Sig extends AnyViewSignature, Arg extends unknown> {
  signature: Sig
  onComponent?: ComponentCallback<Sig, Arg>
}

export interface CommandHandler<Sig extends AnyCommandSignature, Arg extends unknown> extends Handler<Sig, Arg> {
  signature: Sig
  guildSignature?(arg: Arg, guild_id: string): Promise<Sig | null> | Sig | null
  onCommand(ctx: CommandContext<Sig>, arg: Arg): Promise<CommandInteractionResponse>
  onAutocomplete?: ViewAutocompleteCallback<Sig['config']['type'], Arg>

//    (
//     ctx: AutocompleteContext,
//     arg: Arg,
//   ): Promise<
//     Sig['config']['type'] extends D.ApplicationCommandType.ChatInput
//       ? D.APIApplicationCommandAutocompleteResponse
//       : never
//   >
}

/**
 * Ensures that if the signature is guild_only, the interaction is a guild interaction
 */
export function validateInteraction<Sig extends AnyViewSignature, I extends ChatInteraction>(
  signature: Sig,
  interaction: I,
) {
  return (
    signature.guild_only ? checkGuildInteraction(interaction) : interaction
  ) as Sig['config']['guild_only'] extends true ? D.APIGuildInteractionWrapper<I> : I
}

export async function respondToComponent<Arg extends unknown>({
  arg,
  handler,
  interaction,
  state,
  discord,
  onError,
  offload,
  logger,
}: {
  arg: Arg
  handler: Handler<AnyViewSignature, Arg>
  interaction: ComponentInteraction
  state: ViewState<StringDataSchema>
  discord: DiscordAPIClient
  onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource
  offload: OffloadCallback
  logger?: DiscordLogger
}): Promise<ChatInteractionResponse> {
  logger?.setInteractionType(`${handler.signature.name} Component`)

  let valid_interaction = validateInteraction(handler.signature, interaction)

  if (!handler.onComponent) {
    throw new InteractionErrors.CallbackNotImplemented(`onComponent`)
  }

  return handler.onComponent(
    {
      interaction: valid_interaction,
      state,
      defer: (callback, response) => {
        deferResponse(callback, interaction, state, discord, onError, offload)
        return (
          response ?? {
            type: D.InteractionResponseType.DeferredMessageUpdate,
          }
        )
      },
      send: async data => {
        const _interaction = checkGuildMessageComponentInteraction(interaction)
        return await discord.createMessage(_interaction.channel.id, data instanceof MessageData ? data.as_post : data)
      },
    },
    arg,
  )
}

export function deferResponse(
  callback: DeferCallback<any, any>,
  interaction: ChatInteraction,
  state: ViewState<StringDataSchema>,
  discord: DiscordAPIClient,
  onError: InteractionErrorCallback,
  offload: OffloadCallback,
): void {
  offload(
    async ctx =>
      await callback({
        interaction,
        state,
        followup: async (response_data: D.APIInteractionResponseCallbackData) => {
          return discord.createFollowupMessage(interaction.token, response_data)
        },
        edit: async (data: D.RESTPatchAPIWebhookWithTokenMessageJSONBody) => {
          await discord.editOriginalInteractionResponse(interaction.token, {
            content: null,
            embeds: null,
            components: null,
            ...data,
          })
        },
        delete: async (message_id?: string) => {
          await discord.deleteInteractionResponse(interaction.token, message_id)
        },
        send: async data => {
          return await discord.createMessage(interaction.channel!.id, data instanceof MessageData ? data.as_post : data)
        },
      }).catch(async e => {
        await discord.createFollowupMessage(interaction.token, onError(e, ctx.setException).data)
      }),
    async timeout_error => {
      await discord.createFollowupMessage(interaction.token, onError(timeout_error).data)
    },
    `deferred`,
  )
}

export async function respondToCommand<Sig extends AnyCommandSignature, Arg extends unknown>({
  handler,
  interaction,
  discord,
  onError,
  offload,
  arg,
  logger,
}: {
  handler: CommandHandler<Sig, Arg>
  interaction: AppCommandInteraction<Sig['config']['type']>
  discord: DiscordAPIClient
  onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource
  offload: OffloadCallback
  arg: Arg
  logger?: DiscordLogger
}): Promise<CommandInteractionResponse> {
  logger?.setInteractionType(`${handler.signature.name} Command`)

  const state = handler.signature.newState()

  let valid_interaction = validateInteraction(handler.signature, interaction)

  return handler.onCommand(
    {
      interaction: valid_interaction,
      state,
      defer: (callback, response) => {
        deferResponse(callback, interaction, state, discord, onError, offload)
        const default_response = {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        } as InteractionResponse<AppCommandInteraction<Sig["config"]["type"]>>
        return response ?? default_response
      },
      send: async data =>
        discord.createMessage(interaction.channel.id, data instanceof MessageData ? data.as_post : data),
    },
    arg,
  )
}

export async function respondToAutocomplete<Arg extends unknown>(
  handler: CommandHandler<any, Arg>,
  interaction: D.APIApplicationCommandAutocompleteInteraction,
  arg: Arg,
  logger?: DiscordLogger,
): Promise<D.APIApplicationCommandAutocompleteResponse> {
  logger?.setInteractionType(`${handler.signature.name} Autocomplete`)
  if (!handler.onAutocomplete) {
    throw new InteractionErrors.CallbackNotImplemented(`onAutocomplete`)
  }
  const data = await handler.onAutocomplete({ interaction }, arg)
    return { 
    type: D.InteractionResponseType.ApplicationCommandAutocompleteResult,
    data: data ?? {
      choices: []
    }
  }
}
