import { StringDataSchema } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { checkGuildInteraction, DiscordAPIClient, MessageData, ViewState } from '../..'
import type {
  AnyChatInteraction,
  AnyCommandSignature,
  AnySignature,
  AnyViewSignature,
  CommandContext,
  CommandInteractionResponse,
  CommandTypeToInteraction,
  ComponentCallback,
  ComponentInteraction,
  DeferredCommandContext,
  DeferredComponentContext,
  InteractionErrorCallback,
  OffloadCallback,
  ViewAutocompleteCallback,
} from '../types'

export interface ViewHandler<Sig extends AnyViewSignature, Arg extends unknown> {
  signature: Sig
  onComponent: ComponentCallback<Sig, Arg>
}

export interface CommandHandler<Sig extends AnyCommandSignature, Arg extends unknown> {
  signature: Sig
  guildSignature?(arg: Arg, guild_id: string): Promise<Sig | null> | Sig | null
  onCommand(ctx: CommandContext<Sig>, arg: Arg): Promise<CommandInteractionResponse>
  onAutocomplete?: ViewAutocompleteCallback<Sig['config']['type'], Arg>
}

/**
 * Ensures that if the signature is guild_only, the interaction is a guild interaction
 */
export function validateInteraction<Sig extends AnySignature, I extends AnyChatInteraction>(
  signature: Sig,
  interaction: I,
) {
  return (
    signature.config.guild_only ? checkGuildInteraction(interaction) : interaction
  ) as Sig['config']['guild_only'] extends true ? D.APIGuildInteractionWrapper<I> : I
}

export function deferCommandResponse<Sig extends AnyCommandSignature>(
  callback: (ctx: DeferredCommandContext<Sig>) => Promise<void>,
  interaction: Sig['config']['guild_only'] extends true
    ? D.APIGuildInteractionWrapper<CommandTypeToInteraction<Sig['config']['type']>>
    : CommandTypeToInteraction<Sig['config']['type']>,
  discord: DiscordAPIClient,
  onError: InteractionErrorCallback,
  offload: OffloadCallback,
): void {
  offload(
    async ctx =>
      await callback({
        interaction,
        edit: async (data: D.RESTPatchAPIWebhookWithTokenMessageJSONBody, message_id?: string) =>
          discord.editInteractionResponse(
            interaction.token,
            {
              content: null,
              embeds: null,
              components: null,
              ...data,
            },
            message_id,
          ),
        send: async data => {
          return await discord.createMessage(interaction.channel!.id, data instanceof MessageData ? data.as_post : data)
        },
        delete: async (message_id?: string) => {
          await discord.deleteInteractionResponse(interaction.token, message_id)
        },
        followup: async (response_data: D.APIInteractionResponseCallbackData) => {
          return discord.createFollowupMessage(interaction.token, response_data)
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

export function deferComponentResponse(
  callback: (ctx: DeferredComponentContext<AnyViewSignature>) => Promise<void>,
  interaction: ComponentInteraction,
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
        edit: async (data: D.RESTPatchAPIWebhookWithTokenMessageJSONBody, message_id?: string) =>
          discord.editInteractionResponse(
            interaction.token,
            {
              content: null,
              embeds: null,
              components: null,
              ...data,
            },
            message_id,
          ),
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
