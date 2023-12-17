import * as D from 'discord-api-types/v10'
import { view } from 'drizzle-orm/sqlite-core'
import { sentry } from '../../request/sentry'
import type { StringDataSchema } from '../../utils/string_data'
import { DiscordRESTClient } from '../rest/client'
import { MessageData } from '../rest/objects'
import {
  AnyCommandView,
  AnyContext,
  AnyView,
  type ChatInteraction,
  ChatInteractionContext,
  type ChatInteractionResponse,
  CommandContext,
  type CommandInteractionResponse,
  ComponentContext,
  type ComponentInteraction,
  Context,
  DeferContext,
  InitialChatInteractionContext,
  isCommandView
} from './types'
import {
  AppCommandInteraction,
  ApplicationCommandDefinitionArg,
  CommandCallback,
  ComponentCallback,
  DeferCallback,
  SendMessageCallback,
  ViewAutocompleteCallback
} from './types'
import { ViewErrors } from './utils/errors'
import { ViewState } from './view_state'

export abstract class View<TSchema extends StringDataSchema> {
  constructor(
    public options: {
      state_schema: TSchema
      custom_id_prefix?: string
    }
  ) {
    if (options.custom_id_prefix?.includes('.')) {
      throw new ViewErrors.InvalidCustomId(
        `Custom id prefix contains delimiter: ${options.custom_id_prefix}`
      )
    }
  }

  public onComponent(callback: ComponentCallback<View<TSchema>>) {
    this.componentCallback = callback
    return this
  }

  private componentCallback: ComponentCallback<View<TSchema>> = async () => {
    throw new Error('This view has no component callback')
  }

  public async respondComponentInteraction(
    interaction: ComponentInteraction,
    state: ViewState<TSchema>,
    bot: DiscordRESTClient,
    onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource
  ): Promise<ChatInteractionResponse> {
    sentry.request_name = `${
      isCommandView(this) ? this.options.command.name : this.options.custom_id_prefix
    } Component`

    return await this.componentCallback({
      interaction,
      state,
      defer: (initial_response, callback) => {
        sentry.waitUntil(
          this.deferResponse({
            callback,
            interaction,
            state,
            bot,
            onError
          })
        )
        return initial_response
      }
    })
  }

  protected async deferResponse(args: {
    callback: DeferCallback<any, any>
    interaction: ChatInteraction
    state: ViewState<StringDataSchema>
    bot: DiscordRESTClient
    onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource
  }): Promise<void> {
    sentry.addBreadcrumb({
      message: `Deferring response for ${this.options.custom_id_prefix}`,
      category: 'interaction',
      level: 'info'
    })
    try {
      await args.callback({
        interaction: args.interaction,
        followup: async (response_data: D.APIInteractionResponseCallbackData) => {
          await args.bot.followupInteractionResponse(args.interaction.token, response_data)
        },
        edit: async (data: D.RESTPatchAPIWebhookWithTokenMessageJSONBody) => {
          await args.bot.editOriginalInteractionResponse(args.interaction.token, data)
        },
        state: args.state
      })
    } catch (e) {
      let error_response = args.onError(e).data
      if (error_response) {
        await args.bot.followupInteractionResponse(args.interaction.token, error_response)
      }
    }
  }

  getState(
    data: {
      [K in keyof TSchema]?: TSchema[K]['default_value']
    } = {}
  ): ViewState<TSchema> {
    return ViewState.make(this).setAll(data)
  }

  isContextForView(ctx: Context<View<TSchema>>): ctx is Context<View<TSchema>> {
    return JSON.stringify(this.getState(ctx.state.data).data) === JSON.stringify(ctx.state.data)
  }

  isChatInteractionContext(ctx: AnyContext): ctx is ChatInteractionContext<View<TSchema>> {
    try {
      return ctx.hasOwnProperty('interaction') && this.isContextForView(ctx)
    } catch {
      return false
    }
  }

  isDeferContext(ctx: Context<View<TSchema>>): ctx is DeferContext<TSchema> {
    return this.isChatInteractionContext(ctx) && !ctx.hasOwnProperty('defer')
  }

  isInitialChatInteractionContext(
    ctx: AnyContext
  ): ctx is InitialChatInteractionContext<View<TSchema>> {
    return this.isChatInteractionContext(ctx) && ctx.hasOwnProperty('defer')
  }

  isComponentContext(ctx: Context<View<TSchema>>): ctx is ComponentContext<View<TSchema>> {
    return (
      this.isInitialChatInteractionContext(ctx) &&
      (ctx.interaction.type === D.InteractionType.MessageComponent ||
        ctx.interaction.type === D.InteractionType.ModalSubmit)
    )
  }
}

export class CommandView<
  TSchema extends StringDataSchema,
  CommandType extends D.ApplicationCommandType
> extends View<TSchema> {
  constructor(
    public options: {
      type: CommandType
      command: ApplicationCommandDefinitionArg<CommandType>
      state_schema: TSchema
      guild_id?: string
      custom_id_prefix?: string
      experimental?: boolean
    }
  ) {
    super(options)
  }
  public onCommand(callback: CommandCallback<CommandView<TSchema, CommandType>>) {
    this.commandCallback = callback
    return this
  }

  private commandCallback: CommandCallback<CommandView<TSchema, CommandType>> = () => {
    throw new Error('This view has no command callback')
  }

  public async respondCommandInteraction(
    interaction: AppCommandInteraction<CommandType>,
    bot: DiscordRESTClient,
    onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource
  ): Promise<CommandInteractionResponse> {
    sentry.request_name = `${this.options.command.name} Command`

    const state = this.getState()

    return await this.commandCallback({
      interaction,
      state,
      defer: (response, callback) => {
        sentry.waitUntil(
          this.deferResponse({
            callback,
            interaction,
            state,
            bot,
            onError
          })
        )
        return response
      }
    })
  }

  public onAutocomplete(callback: ViewAutocompleteCallback<CommandType>) {
    this.autocompleteCallback = callback
    return this
  }

  private autocompleteCallback: ViewAutocompleteCallback<CommandType> = () => {
    throw new Error('This view has no autocomplete callback')
  }

  public async respondAutocompleteInteraction(
    interaction: D.APIApplicationCommandAutocompleteInteraction
  ): Promise<D.APIApplicationCommandAutocompleteResponse> {
    sentry.request_name = `${interaction.data.name} Autocomplete`
    return await this.autocompleteCallback({ interaction })
  }

  isCommandContext(
    ctx: Context<CommandView<TSchema, CommandType>>
  ): ctx is CommandContext<CommandView<TSchema, CommandType>> {
    return (
      this.isInitialChatInteractionContext(ctx) &&
      ctx.interaction.type === D.InteractionType.ApplicationCommand
    )
  }
}

export class MessageView<TSchema extends StringDataSchema, Params> extends View<TSchema> {
  private sendCallback: SendMessageCallback<MessageView<TSchema, Params>, Params> = async () => {
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
      state_schema: TSchema
      param?: () => Params
    }
  ) {
    super(options)
  }

  public async send(params: Params): Promise<MessageData> {
    return await this.sendCallback({
      state: this.getState(),
      ...params
    })
  }

  /**
   *
   * @param callback
   * @returns
   */
  public onInit(callback: SendMessageCallback<MessageView<TSchema, Params>, Params>) {
    this.sendCallback = callback
    return this
  }
}
