import * as D from 'discord-api-types/v10'
import { MessageData } from '../rest/objects'
import { CommandHandler, Handler } from './views'
import { CommandSignature, ViewSignature } from './views/signature'
import type { ViewState } from './views/state'
import { AnyStringDataSchema, StringDataSchema } from '../../../utils/src/StringData'

export type AppCommandInteraction<CommandType extends D.ApplicationCommandType> =
  CommandType extends D.ApplicationCommandType.ChatInput
    ? D.APIChatInputApplicationCommandInteraction
    : CommandType extends D.ApplicationCommandType.User
      ? D.APIUserApplicationCommandInteraction
      : CommandType extends D.ApplicationCommandType.Message
        ? D.APIMessageApplicationCommandInteraction
        : never

export type ComponentInteraction = D.APIMessageComponentInteraction | D.APIModalSubmitInteraction

export type ChatInteraction = D.APIApplicationCommandInteraction | ComponentInteraction

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

export type InteractionResponse<InteractionType extends ChatInteraction> =
  InteractionType extends D.APIApplicationCommandInteraction
    ? CommandInteractionResponse
    : InteractionType extends ComponentInteraction
      ? ChatInteractionResponse
      : never

export type AnyViewSignature = ViewSignature<AnyStringDataSchema, boolean> | AnyCommandSignature

export type AnyAppCommandType = D.ApplicationCommandType.ChatInput | D.ApplicationCommandType.User | D.ApplicationCommandType.Message

export type AnyCommandSignature = CommandSignature<
  AnyStringDataSchema,
  AnyAppCommandType,
  boolean
>

export type AnyChatInputCommandSignature = CommandSignature<AnyStringDataSchema, D.ApplicationCommandType.ChatInput, any>

export type AnyHandler = Handler<AnyViewSignature, any>

export type AnyCommandHandler = CommandHandler<AnyCommandSignature, any>

export function viewIsCommand(view: AnyViewSignature): view is AnyCommandSignature {
  return view instanceof CommandSignature
}

export function viewIsChatInputCommand(view: AnyViewSignature): view is AnyChatInputCommandSignature {
  return viewIsCommand(view) && view.config.type === D.ApplicationCommandType.ChatInput
}

export function handlerIsCommand<Arg extends unknown>(
  handler: Handler<AnyViewSignature, Arg>,
): handler is CommandHandler<AnyCommandSignature, Arg> {
  // Assume that if the signature's config has a type property, it is a command
  return handler.signature.config.hasOwnProperty('type')
}

export function handlerIsChatInputCommand(handler: AnyHandler): handler is AnyCommandHandler {
  return handlerIsCommand(handler) && handler.signature.config.type === D.ApplicationCommandType.ChatInput
}

export type OffloadCallback = (
  callback: (ctx: { setException: (e: unknown) => void; setRequestName: (name: string) => void }) => Promise<void>,
  onTimeout?: (e: Error) => Promise<void>,
  name?: string,
) => void

/**
 * CONTEXTS
 */

// Autocomplete interactions
export interface AutocompleteContext {
  interaction: D.APIApplicationCommandAutocompleteInteraction
}

// Any context that can have a custom id
export interface StateContext<S extends AnyViewSignature> {
  state: ViewState<S['state_schema']>
}

// Any interaction except ping and autocomplete
export interface InteractionContext<S extends AnyViewSignature, I extends ChatInteraction = ChatInteraction>
  extends StateContext<S> {
  interaction: S['guild_only'] extends true ? D.APIGuildInteractionWrapper<I> : I
  send: (data: D.RESTPostAPIChannelMessageJSONBody | MessageData) => Promise<D.RESTPostAPIChannelMessageResult>
}

// Defer
export interface DeferContext<S extends AnyViewSignature, I extends ChatInteraction = ChatInteraction>
  extends InteractionContext<S, I> {
  followup: (data: D.APIInteractionResponseCallbackData) => Promise<D.RESTPostAPIWebhookWithTokenWaitResult>
  edit: (data: D.APIInteractionResponseCallbackData) => Promise<void>
  delete: (message_id?: string) => Promise<void>
}

// Any interaction that hasn't been deferred
export interface InitialInteractionContext<S extends AnyViewSignature, I extends ChatInteraction = ChatInteraction>
  extends InteractionContext<S, I> {
  defer: (callback: DeferCallback<S, I>, initial_response?: InteractionResponse<I>) => InteractionResponse<I>
}

// Command
export interface CommandContext<S extends AnyCommandSignature>
  extends InitialInteractionContext<S, AppCommandInteraction<S['config']['type']>> {}

// Component
export interface ComponentContext<S extends AnyViewSignature> extends InitialInteractionContext<S, ComponentInteraction> {}

// Any context

export type AnyStateContext = StateContext<AnyViewSignature>

export type AnyInteractionContext = InteractionContext<AnyViewSignature>

export type AnyGuildInteractionContext = InteractionContext<ViewSignature<any, true>>

export type AnyComponentContext = ComponentContext<AnyViewSignature>

export type AnyCommandContext = CommandContext<AnyCommandSignature>

export type AnyDeferContext = DeferContext<AnyViewSignature>

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
) => Promise<Type extends D.ApplicationCommandType.ChatInput ? D.APICommandAutocompleteInteractionResponseCallbackData : undefined>

// Command
export type CommandCallback<View extends CommandSignature<any, AnyAppCommandType, any>, Arg extends unknown> = (
  ctx: CommandContext<View>, // , View['config']['type']
  args: Arg,
) => Promise<CommandInteractionResponse>

// export type GuildSignatureCallback<
//   Arg extends unknown,
// > = (arg: Arg, guild_id: string) => Promise<CommandInteractionResponse>

// Component
export type ComponentCallback<S extends AnyViewSignature, Arg extends unknown> = (
  ctx: ComponentContext<S>,
  arg: Arg,
) => Promise<ChatInteractionResponse>

// Defer
export type DeferCallback<S extends AnyViewSignature, I extends ChatInteraction> = (
  ctx: DeferContext<S, I>,
) => Promise<void>

export function $type<T>(): T {
  throw void 0
}

// Middleware

export type InteractionErrorCallback = (
  e: unknown,
  setException?: (e: unknown) => void,
) => D.APIInteractionResponseChannelMessageWithSource

export type FindViewCallback = (
  command?: {
    name: string
    type: D.ApplicationCommandType
  },
  custom_id_prefix?: string,
) => AnyViewSignature | null

export type FindHandlerCallback = (
  command?: {
    name: string
    type: D.ApplicationCommandType
  },
  custom_id_prefix?: string,
) => AnyHandler | null
