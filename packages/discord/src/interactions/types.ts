import * as D from 'discord-api-types/v10'
import { MessageData } from '../rest/objects'
import { CommandHandler, Handler } from './views'
import { CommandSignature, ViewSignature } from './views/signature'
import type { ViewState } from './views/state'

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

export type AnySignature = ViewSignature<any, any> | CommandSignature<any, any, any>

export type AnyAppCommandType = D.ApplicationCommandType.ChatInput | D.ApplicationCommandType.User | D.ApplicationCommandType.Message

export type AnyCommandSignature = CommandSignature<
  any,
  AnyAppCommandType,
  any
>


export type AnyChatInputCommandSignature = CommandSignature<any, D.ApplicationCommandType.ChatInput, any>

export type AnyHandler = Handler<any, any>

export type AnyCommandHandler = CommandHandler<AnyCommandSignature, any>

export function viewIsCommand(view: AnySignature): view is AnyCommandSignature {
  return view instanceof CommandSignature
}

export function viewIsChatInputCommand(view: AnySignature): view is AnyChatInputCommandSignature {
  return viewIsCommand(view) && view.config.type === D.ApplicationCommandType.ChatInput
}

export function handlerIsCommand<Arg extends unknown>(
  handler: Handler<AnySignature, Arg>,
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
export interface StateContext<S extends AnySignature> {
  state: ViewState<S['state_schema']>
}

// Any interaction except ping and autocomplete
export interface InteractionContext<S extends AnySignature, I extends ChatInteraction = ChatInteraction>
  extends StateContext<S> {
  interaction: S['guild_only'] extends true ? D.APIGuildInteractionWrapper<I> : I
  send: (data: D.RESTPostAPIChannelMessageJSONBody | MessageData) => Promise<D.RESTPostAPIChannelMessageResult>
}

// Defer
export interface DeferContext<S extends AnySignature, I extends ChatInteraction = ChatInteraction>
  extends InteractionContext<S, I> {
  followup: (data: D.APIInteractionResponseCallbackData) => Promise<D.RESTPostAPIWebhookWithTokenWaitResult>
  edit: (data: D.APIInteractionResponseCallbackData) => Promise<void>
  delete: (message_id?: string) => Promise<void>
}

// Any interaction that hasn't been deferred
export interface InitialInteractionContext<S extends AnySignature, I extends ChatInteraction = ChatInteraction>
  extends InteractionContext<S, I> {
  defer: (callback: DeferCallback<S, I>, initial_response?: InteractionResponse<I>) => InteractionResponse<I>
}

// Command
export interface CommandContext<S extends AnyCommandSignature>
  extends InitialInteractionContext<S, AppCommandInteraction<S['config']['type']>> {}

// Component
export interface ComponentContext<S extends AnySignature> extends InitialInteractionContext<S, ComponentInteraction> {}

// Any context

export type AnyStateContext = StateContext<AnySignature>

export type AnyInteractionContext = InteractionContext<AnySignature>

export type AnyGuildInteractionContext = InteractionContext<ViewSignature<any, true>>

export type AnyComponentContext = ComponentContext<AnySignature>

export type AnyCommandContext = CommandContext<AnyCommandSignature>

export type AnyDeferContext = DeferContext<AnySignature>

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
export type ComponentCallback<S extends AnySignature, Arg extends unknown> = (
  ctx: ComponentContext<S>,
  arg: Arg,
) => Promise<ChatInteractionResponse>

// Defer
export type DeferCallback<S extends AnySignature, I extends ChatInteraction> = (
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
) => AnySignature | null

export type FindHandlerCallback = (
  command?: {
    name: string
    type: D.ApplicationCommandType
  },
  custom_id_prefix?: string,
) => AnyHandler | null
