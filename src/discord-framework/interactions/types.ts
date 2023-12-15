import {
  APIInteractionResponseChannelMessageWithSource,
  APIInteractionResponseDeferredChannelMessageWithSource,
  APIModalInteractionResponse,
  APIInteractionResponseUpdateMessage,
  APIInteractionResponseDeferredMessageUpdate,
  APIMessageComponentInteraction,
  APIModalSubmitInteraction,
  APIApplicationCommandInteraction,
  ApplicationCommandType,
} from 'discord-api-types/v10'
import { BaseView, CommandView, MessageView } from './views'

// response to any app command interaction
export declare type CommandInteractionResponse =
  | APIInteractionResponseChannelMessageWithSource
  | APIInteractionResponseDeferredChannelMessageWithSource
  | APIModalInteractionResponse

// Response to any interaction except autocomplete and ping
export declare type ChatInteractionResponse =
  | CommandInteractionResponse
  | APIInteractionResponseUpdateMessage
  | APIInteractionResponseDeferredMessageUpdate

export declare type ComponentInteraction =
  | APIMessageComponentInteraction
  | APIModalSubmitInteraction

export declare type ChatInteraction = APIApplicationCommandInteraction | ComponentInteraction

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
) => APIInteractionResponseChannelMessageWithSource
