import * as D from 'discord-api-types/v10'
import type { StringDataSchema } from '../../utils/string_data'
import type { MessageData } from '../rest/objects'
import type { ViewState } from './view_state'
import { AppCommand, MessageView, View } from './views'

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

type InteractionResponse<InteractionType extends ChatInteraction> =
  InteractionType extends D.APIApplicationCommandInteraction
    ? CommandInteractionResponse
    : InteractionType extends ComponentInteraction
      ? ChatInteractionResponse
      : never

export type AnyView = View<any>

export type AnyAppCommand = AppCommand<any, D.ApplicationCommandType>

export type ChatInputAppCommand = AppCommand<any, D.ApplicationCommandType.ChatInput>

export type AnyMessageView = MessageView<any, any>

export function viewIsAppCommand(view: AnyView): view is AnyAppCommand {
  return view instanceof AppCommand
}

export function viewIsChatInputAppCommand(view: AnyView): view is ChatInputAppCommand {
  return viewIsAppCommand(view) && view.options.type === D.ApplicationCommandType.ChatInput
}

export type FindViewCallback = (
  command?: {
    name: string
    type: D.ApplicationCommandType
    guild_id?: string
  },
  custom_id_prefix?: string,
) => AnyView | undefined

export type InteractionErrorCallback = (
  e: unknown,
  setException?: (e: unknown) => void,
) => D.APIInteractionResponseChannelMessageWithSource

/**
 * CONTEXTS
 */

// Autocomplete interactions
export interface AutocompleteContext {
  interaction: D.APIApplicationCommandAutocompleteInteraction
}

// Any context that can have a custom id
export interface StateContext<View extends AnyView> {
  state: ViewState<View['state_schema']>
}

// Message
export type MessageCreateContext<View extends AnyMessageView, Params> = StateContext<View> & Params

// Any interaction except ping and autocomplete
export interface InteractionContext<
  View extends AnyView,
  InteractionT extends ChatInteraction = ChatInteraction,
> extends StateContext<View> {
  interaction: InteractionT
}

// Defer
export interface DeferContext<
  View extends AnyView,
  InteractionT extends ChatInteraction = ChatInteraction,
> extends InteractionContext<View, InteractionT> {
  followup: (
    data: D.APIInteractionResponseCallbackData,
  ) => Promise<D.RESTPostAPIWebhookWithTokenWaitResult>
  edit: (data: D.APIInteractionResponseCallbackData) => Promise<void>
  delete: (message_id?: string) => Promise<void>
}

// Any interaction that hasn't been deferred
export interface InitialInteractionContext<
  View extends AnyView,
  InteractionT extends ChatInteraction = ChatInteraction,
> extends InteractionContext<View, InteractionT> {
  defer: (
    initial_response: InteractionResponse<InteractionT>,
    callback: DeferCallback<View, InteractionT>,
  ) => InteractionResponse<InteractionT>
}

// Command
export interface CommandContext<
  View extends AnyView,
  Type extends D.ApplicationCommandType = View extends AnyAppCommand
    ? View['options']['type']
    : D.ApplicationCommandType,
> extends InitialInteractionContext<View, AppCommandInteraction<Type>> {}

// Component
export interface ComponentContext<View extends AnyView>
  extends InitialInteractionContext<View, ComponentInteraction> {}

export type AnyContext =
  | CommandContext<AnyView, D.ApplicationCommandType>
  | ComponentContext<AnyView>
  | MessageCreateContext<AnyMessageView, any>
  | DeferContext<AnyView>

/**
 * CALLBACKS
 */

// Autocomplete
export type ViewAutocompleteCallback<Type extends D.ApplicationCommandType> = (
  ctx: AutocompleteContext,
) => Promise<
  Type extends D.ApplicationCommandType.ChatInput
    ? D.APIApplicationCommandAutocompleteResponse
    : never
>

// Command
export type CommandCallback<View extends AnyAppCommand> = (
  ctx: CommandContext<View, View['options']['type']>,
) => Promise<CommandInteractionResponse>

// Component
export type ComponentCallback<View extends AnyView> = (
  ctx: ComponentContext<View>,
) => Promise<ChatInteractionResponse>

// Defer
export type DeferCallback<View extends AnyView, InteractionType extends ChatInteraction> = (
  ctx: DeferContext<View, InteractionType>,
) => Promise<void>

// Message
export type SendMessageCallback<View extends AnyMessageView, Params> = (
  ctx: MessageCreateContext<View, Params>,
) => Promise<MessageData>

export const _ = null

export function $type<T>(): T {
  throw void 0
}
