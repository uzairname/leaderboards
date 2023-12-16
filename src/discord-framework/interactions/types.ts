import { ApplicationCommandType } from 'discord-api-types/v10'
import type * as D from 'discord-api-types/v10'

import type { StringDataSchema } from '../../utils/string_data'

import { BaseView, CommandView, MessageView } from './views'
import type { MessageData } from '../rest/objects'
import type { ViewState } from './view_state'

// response to any app command interaction
export declare type CommandInteractionResponse =
  | D.APIInteractionResponseChannelMessageWithSource
  | D.APIInteractionResponseDeferredChannelMessageWithSource
  | D.APIModalInteractionResponse

// Response to any interaction except autocomplete and ping
export declare type ChatInteractionResponse =
  | CommandInteractionResponse
  | D.APIInteractionResponseUpdateMessage
  | D.APIInteractionResponseDeferredMessageUpdate

export declare type ComponentInteraction =
  | D.APIMessageComponentInteraction
  | D.APIModalSubmitInteraction

export declare type ChatInteraction = D.APIApplicationCommandInteraction | ComponentInteraction

export declare type AnyView = BaseView<any>

export declare type AnyCommandView = CommandView<any, ApplicationCommandType>

export declare type ChatInputCommandView = CommandView<any, ApplicationCommandType.ChatInput>

export declare type AnyMessageView = MessageView<any, any>

export function isCommandView(view: AnyView): view is AnyCommandView {
  return view instanceof CommandView
}

export function isChatInputCommandView(view: AnyView): view is ChatInputCommandView {
  return isCommandView(view) && view.options.type === ApplicationCommandType.ChatInput
}

export type FindViewCallback = (
  command?: {
    name: string
    type: ApplicationCommandType
    guild_id?: string
  },
  custom_id_prefix?: string,
) => Promise<AnyView | undefined>

export type InteractionErrorCallback = (
  e: unknown,
) => D.APIInteractionResponseChannelMessageWithSource
export declare type AppCommandInteraction<CommandType extends D.ApplicationCommandType> =
  CommandType extends D.ApplicationCommandType.ChatInput
    ? D.APIChatInputApplicationCommandInteraction
    : CommandType extends D.ApplicationCommandType.User
    ? D.APIUserApplicationCommandInteraction
    : CommandType extends D.ApplicationCommandType.Message
    ? D.APIMessageApplicationCommandInteraction
    : never

declare type InteractionResponse<InteractionType extends ChatInteraction> =
  InteractionType extends D.APIApplicationCommandInteraction
    ? CommandInteractionResponse
    : InteractionType extends ComponentInteraction
    ? ChatInteractionResponse
    : never

/**
 * CONTEXTS
 */

// Autocomplete
export interface AutocompleteContext {
  interaction: D.APIApplicationCommandAutocompleteInteraction
}

export interface Context<View extends AnyView> {
  state: ViewState<View['options']['state_schema']>
}

// Message
export interface MessageCreateContext<View extends MessageView<any, any>> extends Context<View> {}

export interface ChatInteractionContext<
  View extends AnyView,
  InteractionT extends ChatInteraction = ChatInteraction,
> extends Context<View> {
  interaction: InteractionT
}

// Defer
export interface DeferContext<
  Schema extends StringDataSchema,
  InteractionT extends ChatInteraction = ChatInteraction,
> extends ChatInteractionContext<BaseView<Schema>, InteractionT> {
  followup: (data: D.APIInteractionResponseCallbackData) => Promise<void>
  editOriginal: (data: D.APIInteractionResponseCallbackData) => Promise<void>
}

export interface InitialChatInteractionContext<
  View extends AnyView,
  InteractionT extends ChatInteraction = ChatInteraction,
> extends ChatInteractionContext<View, InteractionT> {
  defer: (
    initial_response: InteractionResponse<InteractionT>,
    callback: DeferCallback<View, InteractionT>,
  ) => InteractionResponse<InteractionT>
}

// Command
export interface CommandContext<View extends AnyCommandView>
  extends InitialChatInteractionContext<View, AppCommandInteraction<View['options']['type']>> {}

// Component
export interface ComponentContext<View extends AnyView>
  extends InitialChatInteractionContext<View, ComponentInteraction> {}

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
export type CommandCallback<View extends AnyCommandView> = (
  ctx: CommandContext<View>,
) => Promise<CommandInteractionResponse>

// Component
export type ComponentCallback<View extends AnyView> = (
  ctx: ComponentContext<View>,
) => Promise<ChatInteractionResponse>

// Defer
export type DeferCallback<View extends AnyView, InteractionType extends ChatInteraction> = (
  ctx: DeferContext<View['options']['state_schema'], InteractionType>,
) => Promise<void>

// Message
export type SendMessageCallback<View extends MessageView<any, any>, Params> = (
  ctx: MessageCreateContext<View> & Params,
) => Promise<MessageData>
export type ApplicationCommandDefinitionArg<Type extends D.ApplicationCommandType> = Omit<
  Type extends D.ApplicationCommandType.ChatInput
    ? D.RESTPostAPIChatInputApplicationCommandsJSONBody
    : Type extends D.ApplicationCommandType.User | D.ApplicationCommandType.Message
    ? D.RESTPostAPIContextMenuApplicationCommandsJSONBody
    : never,
  'type'
>

export const _ = null

export function $type<T>(): T {
  throw void 0
}
