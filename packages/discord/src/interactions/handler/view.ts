import * as D from 'discord-api-types/v10'
// import { sentry } from '../../logging/sentry'
import type { StringDataSchema } from '@repo/utils'
import { DiscordAPIClient } from '../../rest/client'
import { MessageData } from '../../rest/objects'
import { checkGuildInteraction, checkGuildMessageComponentInteraction } from '../checks/interaction'
import { InteractionErrors } from '../errors'
import type {
  AppCommandInteraction,
  ChatInteraction,
  ChatInteractionResponse,
  CommandCallback,
  CommandInteractionResponse,
  ComponentCallback,
  ComponentInteraction,
  DeferCallback,
  InteractionErrorCallback,
  OffloadCallback,
  ViewAutocompleteCallback,
} from './types'
import { ViewState, ViewStateFactory } from './view-state'

export abstract class BaseView<
  TSchema extends StringDataSchema = {},
  Guild extends boolean = true,
> {
  name: string
  state_schema: TSchema
  guild_only: Guild

  protected constructor(
    public config: {
      custom_id_prefix?: string
      name?: string
      state_schema?: TSchema
      guild_only?: Guild
    },
  ) {
    this.state_schema = config.state_schema ?? ({} as TSchema)
    this.name = config.name ?? this.config.custom_id_prefix ?? 'Unnamed View'
    this.guild_only = config.guild_only ?? (true as Guild)
    if (config.custom_id_prefix?.includes('.')) {
      throw new InteractionErrors.InvalidCustomId(
        `Custom id prefix contains delimiter: ${config.custom_id_prefix}`,
      )
    }
  }

  onComponent(callback: ComponentCallback<BaseView<TSchema, Guild>>) {
    this.componentCallback = callback
    return this
  }

  private componentCallback: ComponentCallback<BaseView<TSchema, Guild>> = async () => {
    throw new InteractionErrors.CallbackNotImplemented(`${this.name} has no component callback`)
  }

  async respondToComponent(
    interaction: ComponentInteraction,
    state: ViewState<TSchema>,
    discord: DiscordAPIClient,
    onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource,
    offload: OffloadCallback,
  ): Promise<ChatInteractionResponse> {
    // sentry.request_name = `${this.name} Component`

    let valid_interaction
    if (this.config.guild_only) {
      valid_interaction = checkGuildInteraction(interaction)
    } else {
      valid_interaction = interaction
    }

    return this.componentCallback({
      interaction: valid_interaction as Guild extends true
        ? D.APIGuildInteractionWrapper<ComponentInteraction>
        : ComponentInteraction,
      state,
      defer: (initial_response, callback) => {
        this.deferResponse(callback, interaction, state, discord, onError, offload)
        return initial_response
      },
      send: async data => {
        const _interaction = checkGuildMessageComponentInteraction(interaction)
        return await discord.createMessage(
          _interaction.channel.id,
          data instanceof MessageData ? data.as_post : data,
        )
      },
    })
  }

  protected deferResponse(
    callback: DeferCallback<any, any>,
    interaction: ChatInteraction,
    state: ViewState<StringDataSchema>,
    discord: DiscordAPIClient,
    onError: InteractionErrorCallback,
    offload: OffloadCallback,
  ): void {
    offload(
      async ctx =>
        await callback({
          interaction,
          state,
          followup: async (response_data: D.APIInteractionResponseCallbackData) => {
            return discord.createFollowupMessage(interaction.token, response_data)
          },
          edit: async (data: D.RESTPatchAPIWebhookWithTokenMessageJSONBody) => {
            await discord.editOriginalInteractionResponse(interaction.token, {
              content: null,
              embeds: null,
              components: null,
              ...data,
            })
          },
          delete: async (message_id?: string) => {
            await discord.deleteInteractionResponse(interaction.token, message_id)
          },
          send: async data => {
            return await discord.createMessage(
              interaction.channel!.id,
              data instanceof MessageData ? data.as_post : data,
            )
          },
        }).catch(async e => {
          await discord.createFollowupMessage(interaction.token, onError(e, ctx.setException).data)
        }),
      async timeout_error => {
        await discord.createFollowupMessage(interaction.token, onError(timeout_error).data)
      },
      `deferred`,
    )
  }

  // newState(data: { [K in keyof TSchema]?: TSchema[K]['write'] | null } = {}): ViewState<TSchema> {
  newState(data: { [K in keyof TSchema]?: TSchema[K]['type'] | null } = {}): ViewState<TSchema> {
    return ViewStateFactory.fromView(this).setAll(data)
  }
}

export class CommandView<
  TSchema extends StringDataSchema,
  CommandType extends D.ApplicationCommandType,
  Guild extends boolean = true,
> extends BaseView<TSchema, Guild> {
  constructor(
    public config: (CommandType extends D.ApplicationCommandType.ChatInput
      ? D.RESTPostAPIChatInputApplicationCommandsJSONBody
      : D.RESTPostAPIContextMenuApplicationCommandsJSONBody) & {
      type: CommandType
      state_schema?: TSchema
      custom_id_prefix?: string
      guild_only?: Guild
    },
  ) {
    super(config)
  }

  onCommand(callback: CommandCallback<this>) {
    this.commandCallback = callback
    return this
  }

  private commandCallback: CommandCallback<this> = () => {
    throw new InteractionErrors.CallbackNotImplemented(`${this.name} has no command callback`)
  }

  async respondToCommand(
    interaction: AppCommandInteraction<CommandType>,
    discord: DiscordAPIClient,
    onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource,
    offload: OffloadCallback,
  ): Promise<CommandInteractionResponse> {
    // sentry.request_name = `${this.name} command`

    const state = this.newState()

    let valid_interaction
    if (this.config.guild_only) {
      valid_interaction = checkGuildInteraction(interaction)
    } else {
      valid_interaction = interaction
    }

    return this.commandCallback({
      interaction: valid_interaction as any,
      state,
      defer: (response, callback) => {
        this.deferResponse(callback, interaction, state, discord, onError, offload)
        return response
      },
      send: async data =>
        discord.createMessage(
          interaction.channel.id,
          data instanceof MessageData ? data.as_post : data,
        ),
    })
  }

  onAutocomplete(callback: ViewAutocompleteCallback<CommandType>) {
    this.autocompleteCallback = callback
    return this
  }

  private autocompleteCallback: ViewAutocompleteCallback<CommandType> = () => {
    throw new InteractionErrors.CallbackNotImplemented(`${this.name} has no autocomplete callback`)
  }

  async respondToAutocomplete(
    interaction: D.APIApplicationCommandAutocompleteInteraction,
  ): Promise<D.APIApplicationCommandAutocompleteResponse> {
    // sentry.request_name = `${interaction.data.name} Autocomplete`
    return this.autocompleteCallback({ interaction })
  }
}

export type MessageViewConfig<TSchema extends StringDataSchema, Guild extends boolean> = {
  name?: string
  state_schema?: TSchema
  custom_id_prefix?: string
  guild_only?: Guild
}

export class MessageView<
  TSchema extends StringDataSchema,
  Guild extends boolean = true,
> extends BaseView<TSchema, Guild> {
  constructor(public readonly config: MessageViewConfig<TSchema, Guild>) {
    super(config)
  }
}
