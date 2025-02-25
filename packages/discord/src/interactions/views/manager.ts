import { sequential } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { json } from 'itty-router'
import { StringDataSchema } from '../../../../utils/src/StringData'
import { DiscordLogger } from '../../logging'
import { DiscordAPIClient } from '../../rest'
import { isChatInputCommandHandler, isCommandHandler, isViewHandler } from '../checks/handlers'
import { InteractionErrors } from '../errors'
import { AnyCommandSignature, AnyViewHandler, type InteractionErrorCallback, type OffloadCallback } from '../types'
import { CommandHandler, ViewHandler, respondToAutocomplete, respondToCommand, respondToComponent } from './handlers'
import { logInteraction } from './log-interaction'
import { ViewState, ViewStateFactory } from './state'
import { verify } from './verify'

export class ViewManager<Arg extends unknown = undefined> {
  public all_handlers: (ViewHandler<any, Arg> | CommandHandler<any, Arg>)[] = []

  logger?: DiscordLogger

  constructor(public handlers: (ViewHandler<any, Arg> | CommandHandler<any, Arg> | ViewManager<Arg>)[]) {
    this.all_handlers = handlers.flatMap(v => (v instanceof ViewManager ? v.all_handlers : [v]))

    // Identify duplicate custom_id_prefixes
    const custom_id_prefixes = this.all_handlers.filter(isViewHandler).map(h => h.signature.config.custom_id_prefix)
    const duplicates = custom_id_prefixes.filter((v, i) => v !== undefined && custom_id_prefixes.indexOf(v) !== i)
    if (duplicates.length > 0) throw new Error(`Duplicate custom_id_prefixes: ${duplicates} ${duplicates.join(', ')}.`)

  }

  findCommandHandler(command: { name: string; type: number }): CommandHandler<any, Arg> {
    this.logger?.log({ message: 'Finding command handler', data: { command } })

    const matching_handlers = this.all_handlers.filter(isCommandHandler).filter(h => {
      return command.name === h.signature.config.name && command.type === h.signature.config.type
    })

    if (matching_handlers.length !== 1) {
      throw new Error(`Expecting unique handler for interaction, found ${matching_handlers.length}.`)
    }

    return matching_handlers[0]
  }

  findViewHandler(custom_id_prefix: string): ViewHandler<any, Arg> {
    this.logger?.log({ message: 'Finding view handler', data: { custom_id_prefix } })

    const matching_handlers = this.all_handlers.filter(isViewHandler).filter(h => {
      return h.signature.config.custom_id_prefix === custom_id_prefix
    })

    if (matching_handlers.length !== 1) {
      throw new Error(`Expecting unique handler for interaction, found ${matching_handlers.length}.`)
    }

    return matching_handlers[0]
  }

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

    logInteraction(interaction)

    if (
      interaction.type === D.InteractionType.ApplicationCommand ||
      interaction.type === D.InteractionType.ApplicationCommandAutocomplete
    ) {
      const handler = this.findCommandHandler({ name: interaction.data.name, type: interaction.data.type })

      if (interaction.type === D.InteractionType.ApplicationCommand) {
        if (isCommandHandler(handler))
          return respondToCommand({
            handler,
            interaction: interaction as any /** TODO: fix type */,
            discord,
            onError,
            offload,
            arg,
            logger: this.logger,
          })
        throw new InteractionErrors.InvalidViewType()
      }

      if (interaction.type === D.InteractionType.ApplicationCommandAutocomplete) {
        if (isChatInputCommandHandler(handler)) return respondToAutocomplete(handler, interaction, this.logger)
        throw new InteractionErrors.InvalidViewType()
      }
    }

    const { handler, state } = this.fromCustomId(interaction.data.custom_id)

    return respondToComponent<Arg>({ arg, handler, interaction, state, discord, onError, offload, logger: this.logger })
  }

  fromCustomId(custom_id: string): { handler: AnyViewHandler; state: ViewState<StringDataSchema> } {
    const [prefix, encoded_data] = ViewStateFactory.splitCustomId(custom_id)
    const handler = this.findViewHandler(prefix)
    const state = ViewStateFactory.fromSignature(handler.signature).decode(encoded_data)
    return { handler, state }
  }

  async commandSignatures({
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
        if (c.signature.config.experimental && !include_experimental) {
          return null
        }
        if (guild_id) {
          // if we're looking for guild commands, get its guild signature
          if (c.guildSignature) {
            return await c.guildSignature(arg, guild_id)
          }
        } else {
          // if we're not looking for guild commands, get its global signature
          if (!c.guildSignature) {
            // get its global signature only if it doesn't have a guild signature
            return c.signature
          }
        }
      }),
    )

    const filtered = cmds.filter(v => !!v)
    return filtered
  }
}
