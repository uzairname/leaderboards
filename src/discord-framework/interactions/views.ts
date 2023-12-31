import * as D from 'discord-api-types/v10'

import { StringData, StringDataSchema } from './utils/string_data'

import { MessageData } from '../rest/objects'

import {
  ChatInteraction,
  CommandInteractionResponse,
  ComponentInteraction,
  ChatInteractionResponse,
  AnyCommandView,
  AnyView,
} from './types'
import {
  compressCustomIdUTF16,
  executeViewOffloadCallback,
  getMessageViewMessageData,
  replaceResponseCustomIds,
} from './view_helpers'
import { sentry } from '../../logging/globals'
import { DiscordRESTClient } from '../rest/client'
import { APIInteractionResponseChannelMessageWithSource } from 'discord-api-types/v10'
import {
  isChatInputApplicationCommandInteraction,
  isContextMenuApplicationCommandInteraction,
} from 'discord-api-types/utils/v10'

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

export interface BaseContext<View extends BaseView<any>> {
  interaction: ChatInteraction
  state: StringData<View['options']['state_schema']>
  _ctx: {
    bot: DiscordRESTClient
    onError: (e: unknown) => APIInteractionResponseChannelMessageWithSource
  }
}

// Command
export interface CommandContext<View extends AnyCommandView> extends BaseContext<View> {
  interaction: CommandInteraction<View['options']['type']>
  offload: (callback: ViewOffloadCallback<View>) => void
}

// Component
export interface ComponentContext<View extends BaseView<any>> extends BaseContext<View> {
  interaction: ComponentInteraction
  offload: (callback: ViewOffloadCallback<View>) => void
}

// Offload
export interface OffloadContext<Schema extends StringDataSchema>
  extends BaseContext<BaseView<Schema>> {
  followup: (data: D.APIInteractionResponseCallbackData) => Promise<void>
  editOriginal: (data: D.APIInteractionResponseCallbackData) => Promise<void>
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
) => Promise<CommandInteractionResponse | RespondWithCommand>

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
  experimental?: boolean
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

export class RespondWithCommand {
  constructor(
    public readonly response: CommandInteractionResponse,
    public readonly command: AnyCommandView,
  ) {}
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

  validateInteraction(
    interaction: D.APIApplicationCommandInteraction,
  ): asserts interaction is CommandInteraction<Type> {
    if (isChatInputApplicationCommandInteraction(interaction)) {
      if (this.options.type !== D.ApplicationCommandType.ChatInput) {
        throw new Error(
          `Expected a chat input command interaction, but got a ${interaction.type} command interaction`,
        )
      }
    } else if (isContextMenuApplicationCommandInteraction(interaction)) {
      if (
        this.options.type !== D.ApplicationCommandType.User &&
        this.options.type !== D.ApplicationCommandType.Message
      ) {
        throw new Error(
          `Expected a user or message command interaction, but got a ${interaction.type} command interaction`,
        )
      }
    }
  }

  public async sendToCommandInteraction(
    ctx: CommandContext<AnyCommandView>,
    state_data: StringData<Schema>['data'],
  ): Promise<RespondWithCommand> {
    const state = new StringData<Schema>(this.options.state_schema)
    state.data = state_data

    // make sure the type of command interaction matches the type of this view's command interactions.
    this.validateInteraction(ctx.interaction)

    const result = await this._commandCallback({
      interaction: ctx.interaction,
      state,
      _ctx: ctx._ctx,
      offload: (callback) => {
        sentry.waitUntil(
          executeViewOffloadCallback({
            view: this,
            callback,
            bot: ctx._ctx.bot,
            interaction: ctx.interaction,
            state,
            onError: ctx._ctx.onError,
          }),
        )
      },
    })

    if (result instanceof RespondWithCommand) {
      return result
    }
    return new RespondWithCommand(result, this)
  }
}

interface MessageViewOptions<Schema extends StringDataSchema, Param> {
  custom_id_prefix?: string
  state_schema: Schema
  args?: (arg: Param) => void
}

export class MessageView<Schema extends StringDataSchema, Param> extends BaseView<Schema> {
  public _initCallback: ViewCreateMessageCallback<MessageView<Schema, Param>, Param> = async () => {
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
    return await getMessageViewMessageData(this, params)
  }

  /**
   *
   * @param callback
   * @returns
   */
  public onInit(callback: ViewCreateMessageCallback<MessageView<Schema, Param>, Param>) {
    this._initCallback = callback
    return this
  }
}
