import { sequential } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { json } from 'itty-router/json'
import { StringDataSchema } from '../../../../utils/src/StringData'
import { DiscordLogger } from '../../logging'
import { DiscordAPIClient, MessageData } from '../../rest'
import { checkGuildMessageComponentInteraction, isCommandInteraction } from '../checks'
import { isChatInputCommandHandler, isCommandHandler, isViewHandler } from '../checks/handlers'
import { InteractionErrors } from '../errors'
import {
  AnyCommandSignature,
  AnyViewHandler,
  AnyViewSignature,
  ChatInteractionResponse,
  CommandInteractionResponse,
  CommandTypeToInteraction,
  ComponentInteraction,
  InteractionResponse,
  type InteractionErrorCallback,
  type OffloadCallback,
} from '../types'
import {
  CommandHandler,
  ViewHandler,
  deferCommandResponse,
  deferComponentResponse,
  validateInteraction,
} from './handlers'
import { logInteraction } from './log-interaction'
import { ViewState, ViewStateFactory } from './state'
import { verify } from './verify'

export class InteractionHandler<Arg extends unknown = undefined> {
  public all_handlers: (ViewHandler<any, Arg> | CommandHandler<any, Arg>)[] = []

  logger?: DiscordLogger

  constructor(public handlers: (ViewHandler<any, Arg> | CommandHandler<any, Arg> | InteractionHandler<Arg>)[]) {
    this.all_handlers = handlers.flatMap(v => (v instanceof InteractionHandler ? v.all_handlers : [v]))

    // Identify duplicate custom_id_prefixes
    const custom_id_prefixes = this.all_handlers.filter(isViewHandler).map(h => h.signature.config.custom_id_prefix)
    const duplicates = custom_id_prefixes.filter((v, i) => undefined !== v && custom_id_prefixes.indexOf(v) !== i)
    if (duplicates.length > 0) throw new Error(`Duplicate custom_id_prefixes: ${duplicates} ${duplicates.join(', ')}.`)
  }

  findCommandHandler(command: { name: string; type: number }): CommandHandler<any, Arg> {
    this.logger?.log({ message: 'Finding command handler', data: { command } })

    const matching_handlers = this.all_handlers.filter(isCommandHandler).filter(h => {
      return command.name === h.signature.config.name && command.type === h.signature.config.type
    })

    if (matching_handlers.length !== 1) {
      throw new InteractionErrors.UnknownView()
    }

    return matching_handlers[0]
  }

  findViewHandler(custom_id_prefix: string): ViewHandler<any, Arg> {
    this.logger?.log({ message: 'Finding view handler', data: { custom_id_prefix } })

    const matching_handlers = this.all_handlers.filter(isViewHandler).filter(h => {
      return h.signature.config.custom_id_prefix === custom_id_prefix
    })

    if (matching_handlers.length !== 1) {
      throw new InteractionErrors.UnknownView()
    }

    return matching_handlers[0]
  }

  /**
   * @param direct_response -
   *  - true: Return a value directly.
   *  - false: Call respond endpoint. Will log interaction response errors in sentry, but successful requests will get canceled.
   * @returns
   */
  async respond({
    bot,
    request,
    onError,
    offload,
    direct_response = true,
    arg,
  }: {
    bot: DiscordAPIClient
    request: Request
    onError: InteractionErrorCallback
    offload: OffloadCallback
    direct_response: boolean
    arg: Arg
  }): Promise<Response> {
    if (!(await verify(request, bot.public_key))) {
      this.logger?.log({ message: 'Invalid signature' })
      return new Response('Invalid signature', { status: 401 })
    }

    const interaction = (await request.json()) as D.APIInteraction

    this.logger?.log({ message: 'Received interaction' })

    const response = await this._respond({ interaction, bot, onError, offload, arg })
      .then(res => res)
      .catch(e => onError(e))

    this.logger?.log({
      message: 'Responding with',
      data: { response: JSON.stringify(response), direct_response },
    })

    if (direct_response) {
      return json(response)
    }

    await bot.createInteractionResponse(interaction.id, interaction.token, response)
    return new Response('OK', { status: 200 })
  }

  private async _respond({
    interaction,
    bot: discord,
    onError,
    offload,
    arg,
  }: {
    interaction: D.APIInteraction
    bot: DiscordAPIClient
    onError: InteractionErrorCallback
    offload: OffloadCallback
    arg: Arg
  }): Promise<D.APIInteractionResponse> {
    if (interaction.type === D.InteractionType.Ping) return { type: D.InteractionResponseType.Pong }

    logInteraction(interaction, this.logger)

    if (
      interaction.type === D.InteractionType.ApplicationCommand ||
      interaction.type === D.InteractionType.ApplicationCommandAutocomplete
    ) {
      const handler = this.findCommandHandler({ name: interaction.data.name, type: interaction.data.type })

      if (interaction.type === D.InteractionType.ApplicationCommand) {
        if (!isCommandHandler(handler) || !isCommandInteraction(interaction))
          throw new InteractionErrors.InvalidViewType()
        return this.respondToCommand<typeof handler.signature>({
          handler,
          interaction,
          discord,
          onError,
          offload,
          arg,
          logger: this.logger,
        })
      }

      if (interaction.type === D.InteractionType.ApplicationCommandAutocomplete) {
        if (!isChatInputCommandHandler(handler)) throw new InteractionErrors.InvalidViewType()
        return this.respondToAutocomplete(handler, interaction, arg, this.logger)
      }
    }

    const { handler, state } = this.fromCustomId(interaction.data.custom_id)

    return this.respondToComponent({
      arg,
      handler,
      interaction,
      state,
      discord,
      onError,
      offload,
      logger: this.logger,
    })
  }

  fromCustomId(custom_id: string): { handler: AnyViewHandler; state: ViewState<StringDataSchema> } {
    try {
      const { prefix, encoded_data } = ViewStateFactory.splitCustomId(custom_id)
      const handler = this.findViewHandler(prefix)
      const state = ViewStateFactory.fromSignature(handler.signature).parse(encoded_data)
      this.logger?.log({
        message: `Decoded custom_id`,
        data: { custom_id, prefix, encoded_data, data: state.data, length: custom_id.length },
      })
      return { handler, state }
    } catch (e) {
      throw new InteractionErrors.CustomIdParseError(custom_id, e)
    }
  }

  async getCommandSignatures({
    guild_id,
    include_experimental = false,
    arg,
  }: {
    guild_id?: string
    include_experimental?: boolean
    arg: Arg
  }): Promise<AnyCommandSignature[]> {
    const all_commands = this.all_handlers.filter(h => isCommandHandler(h))

    const cmds = await sequential(
      all_commands.map(c => async () => {
        // Ignore experimental commands
        if (c.signature.config.experimental && !include_experimental) return null
        // If its a guild command and we're filtering by guild, return the guild-specific signature
        if (guild_id && c.guildSignature) return c.guildSignature(arg, guild_id)
        // If its a global command and we're not filtering by guild, return the global signature
        else if (!c.guildSignature) return c.signature
      }),
    )

    const filtered = cmds.filter(v => !!v)
    return filtered
  }

  respondToCommand<Sig extends AnyCommandSignature>({
    arg,
    handler,
    interaction,
    discord,
    onError,
    offload,
    logger,
  }: {
    arg: Arg
    handler: CommandHandler<Sig, Arg>
    interaction: CommandTypeToInteraction<Sig['config']['type']>
    discord: DiscordAPIClient
    onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource
    offload: OffloadCallback
    logger?: DiscordLogger
  }): Promise<CommandInteractionResponse> {
    logger?.setInteractionType(`${handler.signature.config.name} Command`)

    let valid_interaction = validateInteraction<Sig, CommandTypeToInteraction<Sig['config']['type']>>(
      handler.signature,
      interaction,
    )

    return handler.onCommand(
      {
        interaction: valid_interaction,
        defer: (callback, response) => {
          deferCommandResponse<Sig>(callback, valid_interaction, discord, onError, offload)
          const default_response = {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: { flags: D.MessageFlags.Ephemeral },
          } as InteractionResponse<CommandTypeToInteraction<Sig['config']['type']>>
          return response ?? default_response
        },
        send: async data =>
          discord.createMessage(interaction.channel.id, data instanceof MessageData ? data.as_post : data),
      },
      arg,
    )
  }

  async respondToAutocomplete<Arg extends unknown>(
    handler: CommandHandler<any, Arg>,
    interaction: D.APIApplicationCommandAutocompleteInteraction,
    arg: Arg,
    logger?: DiscordLogger,
  ): Promise<D.APIApplicationCommandAutocompleteResponse> {
    logger?.setInteractionType(`${handler.signature.name} Autocomplete`)
    if (!handler.onAutocomplete) {
      throw new InteractionErrors.CallbackNotImplemented(`onAutocomplete`)
    }
    const data = await handler.onAutocomplete({ interaction }, arg)
    return {
      type: D.InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: data ?? {
        choices: [],
      },
    }
  }

  respondToComponent({
    arg,
    handler,
    interaction,
    state,
    discord,
    onError,
    offload,
    logger,
  }: {
    arg: Arg
    handler: ViewHandler<AnyViewSignature, Arg>
    interaction: ComponentInteraction
    state: ViewState<StringDataSchema>
    discord: DiscordAPIClient
    onError: (e: unknown) => D.APIInteractionResponseChannelMessageWithSource
    offload: OffloadCallback
    logger?: DiscordLogger
  }): Promise<ChatInteractionResponse> {
    logger?.setInteractionType(`${handler.signature.name} Component`)

    let valid_interaction = validateInteraction(handler.signature, interaction)

    if (!handler.onComponent) {
      throw new InteractionErrors.CallbackNotImplemented(`onComponent`)
    }

    return handler.onComponent(
      {
        interaction: valid_interaction,
        state,
        defer: (callback, response) => {
          deferComponentResponse(callback, interaction, state, discord, onError, offload)
          return response ?? { type: D.InteractionResponseType.DeferredMessageUpdate }
        },
        send: async data => {
          const _interaction = checkGuildMessageComponentInteraction(interaction)
          return await discord.createMessage(_interaction.channel.id, data instanceof MessageData ? data.as_post : data)
        },
      },
      arg,
    )
  }
}
