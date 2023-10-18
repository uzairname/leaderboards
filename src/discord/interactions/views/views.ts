import * as D from 'discord-api-types/v10'

import { StringData, StringDataSchema } from './string_data'

import { MessageData } from '../../rest/objects'

import {
  ChatInteraction,
  CommandInteractionResponse,
  ComponentInteraction,
  ChatInteractionResponse,
  AnyCommandView,
} from './types'
import { sendMessageView } from './view_helpers'

declare type CommandInteraction<CommandType> =
  CommandType extends D.ApplicationCommandType.ChatInput
    ? D.APIChatInputApplicationCommandInteraction
    : CommandType extends D.ApplicationCommandType.User
    ? D.APIUserApplicationCommandInteraction
    : CommandType extends D.ApplicationCommandType.Message
    ? D.APIMessageApplicationCommandInteraction
    : never

// CALLBACK CONTEXTS

export type Context<View extends AnyCommandView> = CommandContext<View> | ComponentContext<View>

// Autocomplete
export interface AutocompleteContext {
  interaction: D.APIApplicationCommandAutocompleteInteraction
}

// Command
export interface CommandContext<View extends AnyCommandView> {
  interaction: CommandInteraction<View['options']['type']>
  offload: (callback: ViewOffloadCallback<View>) => void
  state: StringData<View['options']['state_schema']>
}

// Component
export interface ComponentContext<View extends BaseView<any>> {
  interaction: ComponentInteraction
  modal_entries?: D.ModalSubmitComponent[]
  offload: (callback: ViewOffloadCallback<View>) => void
  state: StringData<View['options']['state_schema']>
}

// Offload
export interface OffloadContext<Schema extends StringDataSchema> {
  interaction: ChatInteraction
  modal_entries?: D.ModalSubmitComponent[]
  sendMessage: (data: D.APIInteractionResponseCallbackData) => Promise<void>
  editOriginal: (data: D.APIInteractionResponseCallbackData) => Promise<void>
  state: StringData<Schema>
}

// Message
export interface MessageCreateContext<View extends MessageView<any, any>> {
  state: StringData<View['options']['state_schema']>
}

// CALLBACKS

// Autocomplete
export type ViewAutocompleteCallback<Type extends D.ApplicationCommandType> = (
  ctx: AutocompleteContext,
) => Promise<
  Type extends D.ApplicationCommandType.ChatInput
    ? D.APIApplicationCommandAutocompleteResponse
    : never
>

// Command
export type ViewCommandCallback<View extends AnyCommandView> = (
  ctx: CommandContext<View>,
) => Promise<CommandInteractionResponse>

// Component
export type ViewComponentCallback<View extends BaseView<any>> = (
  ctx: ComponentContext<View>,
) => Promise<ChatInteractionResponse | void>

// Offload
export type ViewOffloadCallback<View extends BaseView<any>> = (
  ctx: OffloadContext<View['options']['state_schema']>,
) => Promise<void>

// Message Create
export type ViewCreateMessageCallback<View extends MessageView<any, any>, Params> = (
  ctx: MessageCreateContext<View>,
  params: Params,
) => Promise<MessageData>

type ApplicationCommandDefinitionArg<Type extends D.ApplicationCommandType> = Omit<
  Type extends D.ApplicationCommandType.ChatInput
    ? D.RESTPostAPIChatInputApplicationCommandsJSONBody
    : Type extends D.ApplicationCommandType.User | D.ApplicationCommandType.Message
    ? D.RESTPostAPIContextMenuApplicationCommandsJSONBody
    : never,
  'type'
>

type CommandViewOptions<Schema extends StringDataSchema, Type extends D.ApplicationCommandType> = {
  type: Type
  command: ApplicationCommandDefinitionArg<Type>
  state_schema: Schema
  guild_id?: string
  custom_id_prefix?: string
}

export abstract class BaseView<Schema extends StringDataSchema> {
  public _componentCallback: ViewComponentCallback<BaseView<Schema>> = async () => {
    throw new Error('This view has no component callback')
  }

  constructor(
    public options: {
      state_schema: Schema
      custom_id_prefix?: string
    },
  ) {}

  public onComponent(callback: ViewComponentCallback<BaseView<Schema>>) {
    this._componentCallback = callback
    return this
  }
}

export class CommandView<
  Schema extends StringDataSchema,
  Type extends D.ApplicationCommandType,
> extends BaseView<Schema> {
  public _commandCallback: ViewCommandCallback<CommandView<Schema, Type>> = async () => {
    throw new Error('This view has no command callback')
  }

  public _autocompleteCallback: ViewAutocompleteCallback<Type> = (async () => {
    throw new Error('This view has no autocomplete callback')
  }) as unknown as ViewAutocompleteCallback<Type>

  constructor(public options: CommandViewOptions<Schema, Type>) {
    super(options)
  }

  public onCommand(callback: ViewCommandCallback<CommandView<Schema, Type>>) {
    this._commandCallback = callback
    return this
  }

  public onAutocomplete(callback: ViewAutocompleteCallback<Type>) {
    this._autocompleteCallback = callback
    return this
  }
}

interface MessageViewOptions<Schema extends StringDataSchema, Param> {
  custom_id_prefix?: string
  state_schema: Schema
  args?: (arg: Param) => void
}

export class MessageView<Schema extends StringDataSchema, Param> extends BaseView<Schema> {
  public _sendCallback: ViewCreateMessageCallback<MessageView<Schema, Param>, Param> = async () => {
    throw new Error('This view has no send callback')
  }

  /**
   *
   * @param options
   * custom_id_prefix?: string,
   * state_schema: Schema,
   * args: (arg: Param) => void
   */
  constructor(public readonly options: MessageViewOptions<Schema, Param>) {
    super(options)
  }

  public async send(params: Param): Promise<MessageData> {
    return await sendMessageView(this, params)
  }

  /**
   *
   * @param callback
   * @returns
   */
  public onSend(callback: ViewCreateMessageCallback<MessageView<Schema, Param>, Param>) {
    this._sendCallback = callback
    return this
  }
}
