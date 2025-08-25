import * as D from 'discord-api-types/v10'
import { checkGuildInteraction } from '../..'
import type {
  AnyChatInteraction,
  AnyCommandSignature,
  AnySignature,
  AnyViewSignature,
  CommandContext,
  CommandInteractionResponse,
  ComponentCallback,
  ViewAutocompleteCallback,
} from '../types'

export interface ViewHandler<Sig extends AnyViewSignature, Arg extends unknown> {
  signature: Sig
  onComponent: ComponentCallback<Sig, Arg>
}

export interface CommandHandler<Sig extends AnyCommandSignature, Arg extends unknown> {
  signature: Sig
  guildSignature?(arg: Arg, guild_id: string): Promise<Sig | null> | Sig | null
  onCommand(ctx: CommandContext<Sig, Arg>, arg: Arg): Promise<CommandInteractionResponse>
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
