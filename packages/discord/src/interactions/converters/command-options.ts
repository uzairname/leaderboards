import { nonNullable } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { isSubCommandOption } from '../checks/command-options'
import { InteractionError, InteractionErrors } from '../errors'

export function getSubcommandOption(
  interaction: D.APIChatInputApplicationCommandInteraction,
): D.APIApplicationCommandInteractionDataSubcommandOption {
  const o = interaction.data.options?.[0]
  if (!isSubCommandOption(o)) {
    throw new InteractionErrors.InvalidOptionType('Expected subcommand option')
  }
  return o
}

// prettier-ignore
type OptionValueType<T extends D.ApplicationCommandOptionType> = 
    T extends D.ApplicationCommandOptionType.String ? string :
    T extends D.ApplicationCommandOptionType.Integer | D.ApplicationCommandOptionType.Number ? number :
    T extends D.ApplicationCommandOptionType.Boolean ? boolean :
    T extends D.ApplicationCommandOptionType.User ? D.APIUser :
    T extends D.ApplicationCommandOptionType.Channel ? D.APIInteractionDataResolvedChannel :
    T extends D.ApplicationCommandOptionType.Role ? D.APIRole :
    T extends D.ApplicationCommandOptionType.Mentionable ? { user?: D.APIUser, role?: D.APIRole } :
    never

/**
 * Parse options from a command interaction based on a schema of option types.
 * @returns an object with the same keys as the schema, but with values of the corresponding type.
 */
export function getOptions<
  T extends {
    [name: string]: { type: D.ApplicationCommandOptionType; required?: boolean; name?: string }
  },
>(
  interaction: D.APIChatInputApplicationCommandInteraction,
  schema: T,
): {
  [key in keyof T]: T[key]['required'] extends true
    ? OptionValueType<T[key]['type']>
    : OptionValueType<T[key]['type']> | undefined
} {
  const result = {} as any

  for (const [key, { type, required, name }] of Object.entries(schema)) {
    result[key] = getPossiblyNestedBasicOptionValue(interaction, name ?? key, type, required)
  }

  return result
}

export function getBasicOptionValue<T extends D.ApplicationCommandOptionType, Required extends boolean>(
  interaction: D.APIChatInputApplicationCommandInteraction,
  options: D.APIApplicationCommandInteractionDataBasicOption[] | undefined,
  option_name: string,
  type: T,
  required: Required = false as Required,
): Required extends true ? OptionValueType<T> : OptionValueType<T> | undefined {
  const result = _getBasicOptionValue(interaction, options, option_name, type)
  if (required && undefined === result) {
    throw new InteractionError(`Missing required option '${option_name}'`)
  }
  return result as OptionValueType<T>
}

function getPossiblyNestedBasicOptionValue<T extends D.ApplicationCommandOptionType, Required extends boolean>(
  interaction: D.APIChatInputApplicationCommandInteraction,
  option_name: string,
  type: T,
  required: Required = false as Required,
): Required extends true ? OptionValueType<T> : OptionValueType<T> | undefined {
  const result = getNestedBasicOptionValue(interaction, interaction.data.options, option_name, type)
  if (required && undefined === result) {
    throw new InteractionError(`Missing required option '${option_name}'`)
  }
  return result as OptionValueType<T>
}

function getNestedBasicOptionValue<T extends D.ApplicationCommandOptionType>(
  interaction: D.APIChatInputApplicationCommandInteraction,
  options: D.APIApplicationCommandInteractionDataOption[] | undefined,
  option_name: string,
  type: T,
): OptionValueType<T> | undefined {
  if (!options) return
  if (
    options[0]?.type === D.ApplicationCommandOptionType.Subcommand ||
    options[0]?.type === D.ApplicationCommandOptionType.SubcommandGroup
  ) {
    return getNestedBasicOptionValue(interaction, options[0].options, option_name, type)
  }
  return _getBasicOptionValue(
    interaction,
    options as D.APIApplicationCommandInteractionDataBasicOption[],
    option_name,
    type,
  )
}

function _getBasicOptionValue<T extends D.ApplicationCommandOptionType>(
  interaction: D.APIChatInputApplicationCommandInteraction,
  options: D.APIApplicationCommandInteractionDataBasicOption[] | undefined,
  option_name: string,
  type: T,
): OptionValueType<T> | undefined {
  if (!options) return
  const o = options.find(o => o.name === option_name)
  if (o) {
    if (o.type !== type)
      throw new InteractionErrors.InvalidOptionType(`Option '${option_name}' is of type ${o.type} (Expected: ${type})`)
    if (
      o.type === D.ApplicationCommandOptionType.Number ||
      o.type === D.ApplicationCommandOptionType.Integer ||
      o.type === D.ApplicationCommandOptionType.String ||
      o.type === D.ApplicationCommandOptionType.Boolean
    ) {
      return o.value as OptionValueType<T>
    } else {
      return getResolvedOptionValue(interaction, option_name, o.type) as OptionValueType<T>
    }
  }
}

export function getResolvedOptionValue(
  interaction: D.APIChatInputApplicationCommandInteraction,
  option_name: string,
  type:
    | D.ApplicationCommandOptionType.User
    | D.ApplicationCommandOptionType.Role
    | D.ApplicationCommandOptionType.Channel
    | D.ApplicationCommandOptionType.Mentionable
    | D.ApplicationCommandOptionType.Attachment,
): OptionValueType<typeof type> | undefined {
  const o = interaction.data.options?.find(o => o.name === option_name)
  const data = interaction.data
  if (o) {
    if (o.type !== type)
      throw new InteractionErrors.InvalidOptionType(`Option '${option_name}' is of type ${o.type} (Expected: ${type})`)
    if (o.type === D.ApplicationCommandOptionType.User) {
      const user = nonNullable(data.resolved?.users?.[o.value], `interaction data resolved user`)
      return user
    } else if (o.type === D.ApplicationCommandOptionType.Role) {
      const role = nonNullable(data.resolved?.roles?.[o.value], `interaction data resolved role`)
      return role
    } else if (o.type === D.ApplicationCommandOptionType.Channel) {
      const channel = nonNullable(data.resolved?.channels?.[o.value], `interaction data resolved channel`)
      return channel
    } else if (o.type === D.ApplicationCommandOptionType.Mentionable) {
      const user = data.resolved?.users?.[o.value]
      const role = data.resolved?.roles?.[o.value]
      return { user, role }
    }
  }
}
