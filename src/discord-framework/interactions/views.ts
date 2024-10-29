import * as D from 'discord-api-types/v10'
import { sentry } from '../../logging/sentry'
import type { DiscordAPIClient } from '../rest/client'
import { ViewErrors } from './errors'
import type {
  AnyContext,
  AppCommandInteraction,
  ChatInteraction,
  ChatInteractionResponse,
  CommandCallback,
  CommandContext,
  CommandInteractionResponse,
  ComponentCallback,
  ComponentContext,
  ComponentInteraction,
  DeferCallback,
  DeferContext,
  InitialInteractionContext,
  InteractionContext,
  InteractionErrorCallback,
  StateContext,
  ViewAutocompleteCallback,
} from './types'
import type { StringDataSchema } from './utils/string_data'
import { ViewState, ViewStateFactory } from './view_state'

export abstract class BaseView<TSchema extends StringDataSchema = {}> {
  name: string
  state_schema: TSchema
  protected constructor(
    public signature: {
      custom_id_prefix?: string
      name?: string
      state_schema?: TSchema
    },
  ) {
    this.state_schema = signature.state_schema ?? ({} as TSchema)
    this.name = this.signature.name ?? this.signature.custom_id_prefix ?? 'Unnamed View'
    if (signature.custom_id_prefix?.includes('.')) {
      throw new ViewErrors.InvalidCustomId(
        `Custom id prefix contains delimiter: ${signature.custom_id_prefix}`,
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
      async timeout_error => {
        await args.bot.createFollowupMessage(
          args.interaction.token,
          args.onError(timeout_error).data,
        )
      },
    )
  }

  createState(
    data: { [K in keyof TSchema]?: TSchema[K]['write'] | null } = {},
  ): ViewState<TSchema> {
    return ViewStateFactory.fromViewSignature(this).setAll(data)
  }

  isStateCtx(ctx: StateContext<this>): ctx is StateContext<this> {
    try {
      return (
        JSON.stringify(this.createState(ctx.state.data).data) === JSON.stringify(ctx.state.data)
      )
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
> extends BaseView<TSchema> {
  constructor(
    public signature: (CommandType extends D.ApplicationCommandType.ChatInput
      ? D.RESTPostAPIChatInputApplicationCommandsJSONBody
      : D.RESTPostAPIContextMenuApplicationCommandsJSONBody) & {
      type: CommandType
      state_schema?: TSchema
      custom_id_prefix?: string
    },
  ) {
    super(signature)
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

    const state = this.createState()

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

export type MessageViewSignature<TSchema extends StringDataSchema> = {
  name?: string
  state_schema?: TSchema
  custom_id_prefix?: string
}

export class MessageView<TSchema extends StringDataSchema> extends BaseView<TSchema> {
  constructor(public readonly signature: MessageViewSignature<TSchema>) {
    super(signature)
  }
}
