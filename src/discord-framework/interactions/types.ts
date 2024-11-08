import * as D from 'discord-api-types/v10'
import type { ViewState } from './view-state'
import { BaseView, CommandView, MessageView } from './views'
import { MessageData } from '../rest/objects'

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

export type AnyView = BaseView<any, any>

export type AnyCommandView = CommandView<any, D.ApplicationCommandType, any>

export type AnyChatInputCommand = CommandView<any, D.ApplicationCommandType.ChatInput, any>

export type AnyMessageView = MessageView<any, any>

export function viewIsCommand(view: AnyView): view is AnyCommandView {
  return view instanceof CommandView
}

export function viewIsChatInputCommand(view: AnyView): view is AnyChatInputCommand {
  return viewIsCommand(view) && view.config.type === D.ApplicationCommandType.ChatInput
}

export type FindViewCallback = (
  command?: {
    name: string
    type: D.ApplicationCommandType
  },
  custom_id_prefix?: string,
) => AnyView | null

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
  // TODO: fix
  state: ViewState<View['state_schema']>
}

// Any interaction except ping and autocomplete
export interface InteractionContext<
  View extends AnyView,
  InteractionT extends ChatInteraction = ChatInteraction,
> extends StateContext<View> {
  interaction: View['guild_only'] extends true
    ? D.APIGuildInteractionWrapper<InteractionT>
    : InteractionT
  send: (data: D.RESTPostAPIChannelMessageJSONBody | MessageData) => Promise<D.RESTPostAPIChannelMessageResult>
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
export interface CommandContext<View extends AnyCommandView>
  extends InitialInteractionContext<View, AppCommandInteraction<View['config']['type']>> {}

// Component
export interface ComponentContext<View extends AnyView>
  extends InitialInteractionContext<View, ComponentInteraction> {}

// Any context

export type AnyStateContext = StateContext<AnyView>

export type AnyInteractionContext = InteractionContext<AnyView>

export type AnyGuildInteractionContext = InteractionContext<BaseView<any, true>>

export type AnyComponentContext = ComponentContext<AnyView>

export type AnyCommandContext = CommandContext<AnyCommandView>

export type AnyDeferContext = DeferContext<AnyView>

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
export type ViewAutocompleteCallback<Type extends D.ApplicationCommandType> = (
  ctx: AutocompleteContext,
) => Promise<
  Type extends D.ApplicationCommandType.ChatInput
    ? D.APIApplicationCommandAutocompleteResponse
    : never
>

// Command
export type CommandCallback<View extends CommandView<any, D.ApplicationCommandType, any>> = (
  ctx: CommandContext<View>, // , View['config']['type']
) => Promise<CommandInteractionResponse>

// Component
export type ComponentCallback<View extends AnyView> = (
  ctx: ComponentContext<View>,
) => Promise<ChatInteractionResponse>

// Defer
export type DeferCallback<View extends AnyView, InteractionType extends ChatInteraction> = (
  ctx: DeferContext<View, InteractionType>,
) => Promise<void>

export function $type<T>(): T {
  throw void 0
}
