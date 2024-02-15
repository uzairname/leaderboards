import * as D from 'discord-api-types/v10'
import { registerAllowUnauthorizedDispatcher } from 'miniflare'
import { sentry } from '../../request/sentry'
import type { StringDataSchema } from '../../utils/string_data'
import type { DiscordAPIClient } from '../rest/client'
import type { MessageData } from '../rest/objects'
import type {
  AnyContext,
  ChatInteraction,
  InteractionContext,
  ChatInteractionResponse,
  CommandContext,
  CommandInteractionResponse,
  ComponentContext,
  ComponentInteraction,
  StateContext,
  DeferContext,
  InitialInteractionContext,
  InteractionErrorCallback,
} from './types'
import type {
  AppCommandInteraction,
  CommandCallback,
  ComponentCallback,
  DeferCallback,
  SendMessageCallback,
  ViewAutocompleteCallback,
} from './types'
import { ViewErrors } from './utils/errors'
import { ViewState } from './view_state'

export abstract class View<TSchema extends StringDataSchema> {
  name: string
  protected constructor(
    public options: {
      custom_id_prefix?: string
      name?: string
    },
    public state_schema = {} as TSchema,
  ) {
    this.name = this.options.name ?? this.options.custom_id_prefix ?? 'Unnamed View'
    if (options.custom_id_prefix?.includes('.')) {
      throw new ViewErrors.InvalidCustomId(
        `Custom id prefix contains delimiter: ${options.custom_id_prefix}`,
      )
    }
  }

  onComponent(callback: ComponentCallback<this>) {
    this.componentCallback = callback
    return this
  }

  private componentCallback: ComponentCallback<this> = async () => {
    throw new ViewErrors.CallbackNotImplemented(`${this.name} has no component callback`)
  }

  async respondToComponent(
    interaction: ComponentInteraction,
    state: ViewState<TSchema>,
    bot: DiscordAPIClient,
    onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource,
  ): Promise<ChatInteractionResponse> {
    sentry.request_name = `${this.name} Component`

    return this.componentCallback({
      interaction,
      state,
      defer: (initial_response, callback) => {
        this.deferResponse({
          callback,
          interaction,
          state,
          bot,
          onError,
        })
        return initial_response
      },
    })
  }

  protected deferResponse(args: {
    callback: DeferCallback<any, any>
    interaction: ChatInteraction
    state: ViewState<StringDataSchema>
    bot: DiscordAPIClient
    onError: InteractionErrorCallback
  }): void {
    sentry.offload(
      async ctx =>
        await args
          .callback({
            interaction: args.interaction,
            state: args.state,
            followup: async (response_data: D.APIInteractionResponseCallbackData) => {
              return args.bot.createFollowupMessage(args.interaction.token, response_data)
            },
            edit: async (data: D.RESTPatchAPIWebhookWithTokenMessageJSONBody) => {
              await args.bot.editOriginalInteractionResponse(args.interaction.token, {
                content: null,
                embeds: null,
                components: null,
                ...data,
              })
            },
            delete: async (message_id?: string) => {
              await args.bot.deleteInteractionResponse(args.interaction.token, message_id)
            },
          })
          .catch(async e => {
            await args.bot.createFollowupMessage(
              args.interaction.token,
              args.onError(e, ctx.setException).data,
            )
          }),
    )
  }

  newState(data: { [K in keyof TSchema]?: TSchema[K]['write'] | null } = {}): ViewState<TSchema> {
    return ViewState.fromView(this).setAll(data)
  }

  isStateCtx(ctx: StateContext<this>): ctx is StateContext<this> {
    try {
      return JSON.stringify(this.newState(ctx.state.data).data) === JSON.stringify(ctx.state.data)
    } catch {
      return false
    }
  }

  isInteractionCtx(ctx: AnyContext): ctx is InteractionContext<this> {
    return this.isStateCtx(ctx) && ctx.hasOwnProperty('interaction')
  }

  isDeferredCtx(ctx: StateContext<this>): ctx is DeferContext<this> {
    return this.isInteractionCtx(ctx) && !ctx.hasOwnProperty('defer')
  }

  isInitialInteractionCtx(ctx: AnyContext): ctx is InitialInteractionContext<this> {
    return this.isInteractionCtx(ctx) && ctx.hasOwnProperty('defer')
  }

  isComponentCtx(ctx: StateContext<this>): ctx is ComponentContext<this> {
    return (
      this.isInitialInteractionCtx(ctx) &&
      (ctx.interaction.type === D.InteractionType.MessageComponent ||
        ctx.interaction.type === D.InteractionType.ModalSubmit)
    )
  }

  isCommandCtx(ctx: StateContext<this>): ctx is CommandContext<this> {
    return (
      this.isInitialInteractionCtx(ctx) &&
      ctx.interaction.type === D.InteractionType.ApplicationCommand
    )
  }
}

export class AppCommand<
  TSchema extends StringDataSchema,
  CommandType extends D.ApplicationCommandType,
> extends View<TSchema> {
  constructor(
    public options: (CommandType extends D.ApplicationCommandType.ChatInput
      ? D.RESTPostAPIChatInputApplicationCommandsJSONBody
      : D.RESTPostAPIContextMenuApplicationCommandsJSONBody) & {
      type: CommandType
      state_schema?: TSchema
      custom_id_prefix?: string
    },
  ) {
    super(options, options.state_schema)
  }

  onCommand(callback: CommandCallback<this>) {
    this.commandCallback = callback
    return this
  }

  private commandCallback: CommandCallback<this> = () => {
    throw new ViewErrors.CallbackNotImplemented(`${this.name} has no command callback`)
  }

  async respondToCommand(
    interaction: AppCommandInteraction<CommandType>,
    bot: DiscordAPIClient,
    onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource,
  ): Promise<CommandInteractionResponse> {
    sentry.request_name = `${this.name} Command`

    const state = this.newState()

    return this.commandCallback({
      interaction,
      state,
      defer: (response, callback) => {
        this.deferResponse({
          callback,
          interaction,
          state,
          bot,
          onError,
        })
        return response
      },
    })
  }

  onAutocomplete(callback: ViewAutocompleteCallback<CommandType>) {
    this.autocompleteCallback = callback
    return this
  }

  private autocompleteCallback: ViewAutocompleteCallback<CommandType> = () => {
    throw new ViewErrors.CallbackNotImplemented(`${this.name} has no autocomplete callback`)
  }

  async respondToAutocomplete(
    interaction: D.APIApplicationCommandAutocompleteInteraction,
  ): Promise<D.APIApplicationCommandAutocompleteResponse> {
    sentry.request_name = `${interaction.data.name} Autocomplete`
    return this.autocompleteCallback({ interaction })
  }
}

export class MessageView<TSchema extends StringDataSchema, Params> extends View<TSchema> {
  private sendCallback: SendMessageCallback<this, Params> = async () => {
    throw new ViewErrors.CallbackNotImplemented(`${this.name} has no send message callback`)
  }

  constructor(
    public readonly options: {
      name?: string
      state_schema?: TSchema
      custom_id_prefix?: string
      param?: () => Params
    },
  ) {
    super(options, options.state_schema)
  }

  async send(args: Params): Promise<MessageData> {
    return this.sendCallback({
      state: this.newState(),
      ...args,
    })
  }

  public onSend(callback: SendMessageCallback<this, Params>) {
    this.sendCallback = callback
    return this
  }
}
