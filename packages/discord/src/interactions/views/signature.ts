import type { StringDataSchema } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { ViewState, ViewStateFactory } from '.'
import { InteractionErrors } from '../errors'
import { AnyAppCommandType } from '../types'
import { CommandHandler, ViewHandler } from './handlers'

export type ViewSignatureConfig<TSchema extends StringDataSchema, Guild extends boolean> = {
  name?: string
  state_schema: TSchema
  custom_id_prefix: string
  guild_only?: Guild
  experimental?: boolean
}

export class ViewSignature<TSchema extends StringDataSchema = {}, Guild extends boolean = true> {
  name: string
  state_schema: TSchema
  guild_only: Guild

  constructor(public config: ViewSignatureConfig<TSchema, Guild>) {
    this.state_schema = config.state_schema ?? ({} as TSchema)
    this.name = config.name ?? this.config.custom_id_prefix ?? 'Unnamed View'
    this.guild_only = config.guild_only ?? (true as Guild)
    if (config.custom_id_prefix?.includes('.')) {
      throw new InteractionErrors.InvalidCustomId(`Custom id prefix contains delimiter: ${config.custom_id_prefix}`)
    }
  }

  newState(data: { [K in keyof TSchema]?: TSchema[K]['type'] | null } = {}): ViewState<TSchema> {
    return ViewStateFactory.fromSignature(this).setAll(data)
  }

  set<Arg>(handlers: Omit<ViewHandler<this, Arg>, 'signature'>): ViewHandler<this, Arg> {
    return {
      ...handlers,
      signature: this,
    }
  }
}

export type CommandSignatureConfig<
  TSchema extends StringDataSchema,
  CommandType extends AnyAppCommandType,
  Guild extends boolean,
> = (CommandType extends D.ApplicationCommandType.ChatInput
  ? D.RESTPostAPIChatInputApplicationCommandsJSONBody
  : D.RESTPostAPIContextMenuApplicationCommandsJSONBody) & {
  type: CommandType
  guild_only?: Guild
  experimental?: boolean
}

export class CommandSignature<
  TSchema extends StringDataSchema,
  CommandType extends AnyAppCommandType,
  Guild extends boolean = true,
> {
  name: string
  guild_only: Guild
  constructor(public readonly config: CommandSignatureConfig<TSchema, CommandType, Guild>) {
    this.name = config.name
    this.guild_only = config.guild_only ?? (true as Guild)
  }

  set<Arg>(handlers: Omit<CommandHandler<this, Arg>, 'signature'>): CommandHandler<this, Arg> {
    return {
      ...handlers,
      signature: this,
    }
  }
}
