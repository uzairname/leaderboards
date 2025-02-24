import * as D from 'discord-api-types/v10'
import { AnyStringDataSchema } from '../../../utils/src/StringData'
import { MessageData } from '../rest/objects'
import { CommandHandler, ViewHandler } from './views'
import { CommandSignature, ViewSignature } from './views/signature'
import type { ViewState } from './views/state'

export type CommandTypeToInteraction<CommandType extends D.ApplicationCommandType> =
  CommandType extends D.ApplicationCommandType.ChatInput
    ? D.APIChatInputApplicationCommandInteraction
    : CommandType extends D.ApplicationCommandType.User
      ? D.APIUserApplicationCommandInteraction
      : CommandType extends D.ApplicationCommandType.Message
        ? D.APIMessageApplicationCommandInteraction
        : never

export type ComponentInteraction = D.APIMessageComponentInteraction | D.APIModalSubmitInteraction

export type CommandInteraction = D.APIChatInputApplicationCommandInteraction | D.APIContextMenuInteraction

export type AnyChatInteraction = CommandInteraction | ComponentInteraction

// response to any app command interaction
export type CommandInteractionResponse =
  | D.APIInteractionResponseChannelMessageWithSource
  | D.APIInteractionResponseDeferredChannelMessageWithSource
  | D.APIModalInteractionResponse

// Response to any interaction except autocomplete and ping
export type ChatInteractionResponse =
  | CommandInteractionResponse
  | D.APIInteractionResponseUpdateMessage
  | D.APIInteractionResponseDeferredMessageUpdate

export type InteractionResponse<InteractionType extends AnyChatInteraction> =
  InteractionType extends D.APIApplicationCommandInteraction
    ? CommandInteractionResponse
    : InteractionType extends ComponentInteraction
      ? ChatInteractionResponse
      : never

export type AnyAppCommandType =
  | D.ApplicationCommandType.ChatInput
  | D.ApplicationCommandType.User
  | D.ApplicationCommandType.Message

export type AnyViewSignature = ViewSignature<AnyStringDataSchema, boolean>

export type AnyChatInputCommandSignature = CommandSignature<
  AnyStringDataSchema,
  D.ApplicationCommandType.ChatInput,
  any
>

export type AnyCommandSignature = CommandSignature<AnyStringDataSchema, AnyAppCommandType, boolean>

export type AnySignature = AnyViewSignature | AnyCommandSignature

export type AnyViewHandler = ViewHandler<AnyViewSignature, any>

export type AnyCommandHandler = CommandHandler<AnyCommandSignature, any>

export type AnyHandler = AnyViewHandler | AnyCommandHandler

/**
 * INTERACTION CONTEXTS
 */

// Autocomplete interactions
export interface AutocompleteContext {
  interaction: D.APIApplicationCommandAutocompleteInteraction
}

// Any interaction that can have a custom id
export interface StateContext<S extends AnyViewSignature> {
  state: ViewState<S['state_schema']>
}

// Any interaction except ping and autocomplete
export interface InteractionContext<S extends AnySignature, I extends AnyChatInteraction = AnyChatInteraction> {
  interaction: S['guild_only'] extends true ? D.APIGuildInteractionWrapper<I> : I
  send: (data: D.RESTPostAPIChannelMessageJSONBody | MessageData) => Promise<D.RESTPostAPIChannelMessageResult>
}

// Defer
export interface DeferredContext {
  edit: (data: D.APIInteractionResponseCallbackData) => Promise<void>
  followup: (data: D.APIInteractionResponseCallbackData) => Promise<D.RESTPostAPIWebhookWithTokenWaitResult>
  delete: (message_id?: string) => Promise<void>
}

export interface DeferredCommandContext<S extends AnyCommandSignature>
  extends DeferredContext,
    InteractionContext<S, CommandTypeToInteraction<S['config']['type']>> {}

export interface DeferredComponentContext<S extends AnyViewSignature>
  extends DeferredContext,
    InteractionContext<S, ComponentInteraction>,
    StateContext<S> {}

// Initial context
export interface CommandContext<S extends AnyCommandSignature>
  extends InteractionContext<S, CommandTypeToInteraction<S['config']['type']>> {
  defer: (
    callback: (ctx: DeferredCommandContext<S>) => Promise<void>,
    initial_response?: CommandInteractionResponse,
  ) => CommandInteractionResponse
}

export interface ComponentContext<S extends AnyViewSignature>
  extends InteractionContext<S, ComponentInteraction>,
    StateContext<S> {
  defer: (
    callback: (ctx: DeferredComponentContext<S>) => Promise<void>,
    initial_response?: ChatInteractionResponse,
  ) => ChatInteractionResponse
}

/**
 *  Either a command or component interaction, not yet deferred
 */
export interface InitialContext<S extends AnyViewSignature>
  extends InteractionContext<S, AnyChatInteraction>,
    StateContext<S> {}

// Any context

export type AnyStateContext = StateContext<AnyViewSignature>

export type AnyInteractionContext = InteractionContext<AnySignature>

export type AnyGuildInteractionContext = InteractionContext<ViewSignature<any, true>>

export type AnyComponentContext = ComponentContext<AnyViewSignature>

export type AnyCommandContext = CommandContext<AnyCommandSignature>

export type AnyDeferContext = DeferredComponentContext<AnyViewSignature> | DeferredCommandContext<AnyCommandSignature>

export type AnyContext =
  | AnyStateContext
  | AnyInteractionContext
  | AnyComponentContext
  | AnyCommandContext
  | AnyDeferContext

/**
 * CALLBACKS
 */

// Autocomplete
export type ViewAutocompleteCallback<Type extends AnyAppCommandType, Arg extends unknown> = (
  ctx: AutocompleteContext,
  arg: Arg,
) => Promise<
  Type extends D.ApplicationCommandType.ChatInput ? D.APICommandAutocompleteInteractionResponseCallbackData : undefined
>

// Command
export type CommandCallback<View extends CommandSignature<any, AnyAppCommandType, any>, Arg extends unknown> = (
  ctx: CommandContext<View>, // , View['config']['type']
  args: Arg,
) => Promise<CommandInteractionResponse>

// Component
export type ComponentCallback<S extends AnyViewSignature, Arg extends unknown> = (
  ctx: ComponentContext<S>,
  arg: Arg,
) => Promise<ChatInteractionResponse>

export type OffloadCallback = (
  callback: (ctx: { setException: (e: unknown) => void; setRequestName: (name: string) => void }) => Promise<void>,
  onTimeout?: (e: Error) => Promise<void>,
  name?: string,
) => void

// Middleware
export type InteractionErrorCallback = (
  e: unknown,
  setException?: (e: unknown) => void,
) => D.APIInteractionResponseChannelMessageWithSource
