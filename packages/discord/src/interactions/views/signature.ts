import type { StringDataSchema } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { ViewState, ViewStateFactory } from '.'
import { InteractionErrors } from '../errors'
import { CommandHandler, Handler } from './handlers'
import { AnyAppCommandType, AnyCommandSignature } from '../types'

export class ViewSignature<TSchema extends StringDataSchema = {}, Guild extends boolean = true> {
  name: string
  state_schema: TSchema
  guild_only: Guild

  constructor(
    public config: {
      name?: string
      state_schema?: TSchema
      custom_id_prefix?: string
      guild_only?: Guild
      experimental?: boolean
    },
  ) {
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

  set<Arg>(handlers: Omit<Handler<this, Arg>, 'signature'>): Handler<this, Arg> {
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
  state_schema?: TSchema
  custom_id_prefix?: string
  guild_only?: Guild
  experimental?: boolean
}

export class CommandSignature<
  TSchema extends StringDataSchema,
  CommandType extends AnyAppCommandType,
  Guild extends boolean = true,
> extends ViewSignature<TSchema, Guild> {
  constructor(public readonly config: CommandSignatureConfig<TSchema, CommandType, Guild>) {
    super(config)
  }

  set<Arg>(handlers: Omit<CommandHandler<this, Arg>, 'signature'>): CommandHandler<this, Arg> {
    return {
      ...handlers,
      signature: this,
    }
  }

}
