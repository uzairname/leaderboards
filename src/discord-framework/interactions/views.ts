import * as D from 'discord-api-types/v10'

import type { StringDataSchema } from '../../utils/string_data'

import { MessageData } from '../rest/objects'

import {
  type ChatInteraction,
  type CommandInteractionResponse,
  type ComponentInteraction,
  type ChatInteractionResponse,
  isCommandView,
} from './types'
import { ViewState } from './view_state'
import { ViewErrors } from './utils/errors'
import { sentry } from '../../request/sentry'
import { DiscordRESTClient } from '../rest/client'
import {
  ApplicationCommandDefinitionArg,
  ComponentCallback,
  DeferCallback,
  CommandCallback,
  AppCommandInteraction,
  ViewAutocompleteCallback,
  SendMessageCallback,
} from './types'

export abstract class BaseView<Schema extends StringDataSchema> {
  constructor(
    public options: {
      state_schema: Schema
      custom_id_prefix?: string
    },
  ) {
    if (options.custom_id_prefix && options.custom_id_prefix.includes('.')) {
      throw new ViewErrors.InvalidCustomId(
        `Custom id prefix contains delimiter: ${options.custom_id_prefix}`,
      )
    }
  }

  public onComponent(callback: ComponentCallback<BaseView<Schema>>) {
    this.componentCallback = callback
    return this
  }

  private componentCallback: ComponentCallback<BaseView<Schema>> = async () => {
    throw new Error('This view has no component callback')
  }

  public async respondToComponentInteraction(
    interaction: ComponentInteraction,
    state: ViewState<Schema>,
    bot: DiscordRESTClient,
    onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource,
  ): Promise<ChatInteractionResponse> {
    sentry.request_name = `${
      isCommandView(this) ? this.options.command.name : this.options.custom_id_prefix
    } Component`

    return await this.componentCallback({
      interaction,
      defer: (initial_response, callback) => {
        sentry.waitUntil(
          this.deferResponse({
            callback,
            interaction,
            state,
            bot,
            onError,
          }),
        )
        return initial_response
      },
      state,
    })
  }

  protected async deferResponse(args: {
    callback: DeferCallback<any, any>
    interaction: ChatInteraction
    state: ViewState<StringDataSchema>
    bot: DiscordRESTClient
    onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource
  }): Promise<void> {
    sentry.debug(`executing offload callback for ${this.options.custom_id_prefix}`)
    try {
      await args.callback({
        interaction: args.interaction,
        followup: async (response_data: D.APIInteractionResponseCallbackData) => {
          await args.bot.followupInteractionResponse(args.interaction.token, response_data)
        },
        editOriginal: async (data: D.RESTPatchAPIWebhookWithTokenMessageJSONBody) => {
          await args.bot.editOriginalInteractionResponse(args.interaction.token, data)
        },
        state: args.state,
      })
    } catch (e) {
      let error_response = args.onError(e).data
      if (error_response) {
        await args.bot.followupInteractionResponse(args.interaction.token, error_response)
      }
    }
  }
}

export class CommandView<
  Schema extends StringDataSchema,
  Type extends D.ApplicationCommandType,
> extends BaseView<Schema> {
  constructor(
    public options: {
      type: Type
      command: ApplicationCommandDefinitionArg<Type>
      state_schema: Schema
      guild_id?: string
      custom_id_prefix?: string
      experimental?: boolean
    },
  ) {
    super(options)
  }
  public onCommand(callback: CommandCallback<CommandView<Schema, Type>>) {
    this.commandCallback = callback
    return this
  }

  private commandCallback: CommandCallback<CommandView<Schema, Type>> = () => {
    throw new Error('This view has no command callback')
  }

  public async receiveCommand(
    interaction: AppCommandInteraction<Type>,
    bot: DiscordRESTClient,
    onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource,
  ): Promise<CommandInteractionResponse> {
    sentry.request_name = `${this.options.command.name} Command`

    const state = ViewState.create(this)

    var response = await this.commandCallback({
      interaction,
      state,
      defer: (response, callback) => {
        sentry.waitUntil(
          this.deferResponse({
            callback,
            interaction,
            state,
            bot,
            onError,
          }),
        )
        return response
      },
    })

    return response
  }

  public onAutocomplete(callback: ViewAutocompleteCallback<Type>) {
    this.autocompleteCallback = callback
    return this
  }

  private autocompleteCallback: ViewAutocompleteCallback<Type> = () => {
    throw new Error('This view has no autocomplete callback')
  }

  public async receiveAutocompleteInteraction(
    interaction: D.APIApplicationCommandAutocompleteInteraction,
  ): Promise<D.APIApplicationCommandAutocompleteResponse> {
    sentry.request_name = `${interaction.data.name} Autocomplete`
    return await this.autocompleteCallback({ interaction })
  }
}

export class MessageView<Schema extends StringDataSchema, Params> extends BaseView<Schema> {
  private sendCallback: SendMessageCallback<MessageView<Schema, Params>, Params> = async () => {
    throw new Error('This view has no send callback')
  }

  /**
   *
   * @param options
   * custom_id_prefix?: string,
   * state_schema: Schema,
   * args: (arg: Param) => void
   */
  constructor(
    public readonly options: {
      custom_id_prefix?: string
      state_schema: Schema
      param?: () => Params
    },
  ) {
    super(options)
  }

  public async send(params: Params): Promise<MessageData> {
    return await this.sendCallback({
      state: ViewState.create(this),
      ...params,
    })
  }

  /**
   *
   * @param callback
   * @returns
   */
  public onInit(callback: SendMessageCallback<MessageView<Schema, Params>, Params>) {
    this.sendCallback = callback
    return this
  }
}
