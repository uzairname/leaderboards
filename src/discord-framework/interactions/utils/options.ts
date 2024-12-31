import * as D from 'discord-api-types/v10'
import { sentry } from '../../../logging/sentry'
import { nonNullable } from '../../../utils/utils'
import { InteractionError, InteractionErrors } from '../errors'

function isSubCommandOption(
  option: D.APIApplicationCommandInteractionDataOption | undefined,
): option is D.APIApplicationCommandInteractionDataSubcommandOption {
  return option?.type === D.ApplicationCommandOptionType.Subcommand
}

export function getSubcommandOption(
  interaction: D.APIChatInputApplicationCommandInteraction,
): D.APIApplicationCommandInteractionDataSubcommandOption {
  const o = interaction.data.options?.[0]
  if (!isSubCommandOption(o)) {
    throw new InteractionErrors.InvalidOptionType('Expected subcommand option')
  }
  return o
}

type OptionValueType<T extends D.ApplicationCommandOptionType> =
  T extends D.ApplicationCommandOptionType.String
    ? string
    : T extends D.ApplicationCommandOptionType.Integer | D.ApplicationCommandOptionType.Number
      ? number
      : T extends D.ApplicationCommandOptionType.Boolean
        ? boolean
        : T extends D.ApplicationCommandOptionType.User
          ? D.APIUser
          : T extends D.ApplicationCommandOptionType.Channel
            ? D.APIInteractionDataResolvedChannel
            : T extends D.ApplicationCommandOptionType.Role
              ? D.APIRole
              : never

export function getOptions<
  T extends {
    [name: string]: { type: D.ApplicationCommandOptionType; required?: boolean; name?: string }
  },
>(
  interaction: D.APIChatInputApplicationCommandInteraction,
  options_config: T,
): {
  [key in keyof T]: T[key]['required'] extends true
    ? OptionValueType<T[key]['type']>
    : OptionValueType<T[key]['type']> | undefined
} {
  sentry.debug(`getOptions: ${JSON.stringify(options_config)}`)
  const result = {} as any

  for (const [key, { type, required, name }] of Object.entries(options_config)) {
    result[key] = getPossiblyNestedBasicOptionValue(interaction, name ?? key, type, required)
  }

  return result
}

export function getBasicOptionValue<
  T extends D.ApplicationCommandOptionType,
  Required extends boolean,
>(
  interaction: D.APIChatInputApplicationCommandInteraction,
  options: D.APIApplicationCommandInteractionDataBasicOption[] | undefined,
  option_name: string,
  type: T,
  required: Required = false as Required,
): Required extends true ? OptionValueType<T> : OptionValueType<T> | undefined {
  const result = _getBasicOptionValue(interaction, options, option_name, type)
  if (required && result === undefined) {
    throw new InteractionError(`Missing required option '${option_name}'`)
  }
  return result as OptionValueType<T>
}

export function getPossiblyNestedBasicOptionValue<
  T extends D.ApplicationCommandOptionType,
  Required extends boolean,
>(
  interaction: D.APIChatInputApplicationCommandInteraction,
  option_name: string,
  type: T,
  required: Required = false as Required,
): Required extends true ? OptionValueType<T> : OptionValueType<T> | undefined {
  const result = getNestedBasicOptionValue(interaction, interaction.data.options, option_name, type)
  if (required && result === undefined) {
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
  sentry.debug(`_getBasicOptionValue: ${option_name} - ${JSON.stringify(o)}`)
  if (o) {
    if (o.type !== type)
      throw new InteractionErrors.InvalidOptionType(
        `Option '${option_name}' is of type ${o.type} (Expected: ${type})`,
      )
    if (
      o.type === D.ApplicationCommandOptionType.Number ||
      o.type === D.ApplicationCommandOptionType.Integer ||
      o.type === D.ApplicationCommandOptionType.String ||
      o.type === D.ApplicationCommandOptionType.Boolean
    ) {
      sentry.debug(`_getBasicOptionValue: ${option_name} - ${o.value}`)
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
      throw new InteractionErrors.InvalidOptionType(
        `Option '${option_name}' is of type ${o.type} (Expected: ${type})`,
      )
    if (o.type === D.ApplicationCommandOptionType.User) {
      const user = nonNullable(data.resolved?.users?.[o.value], `interaction data resolved user`)
      return user
    } else if (o.type === D.ApplicationCommandOptionType.Role) {
      const role = nonNullable(data.resolved?.roles?.[o.value], `interaction data resolved role`)
      return role
    } else if (o.type === D.ApplicationCommandOptionType.Channel) {
      const channel = nonNullable(
        data.resolved?.channels?.[o.value],
        `interaction data resolved channel`,
      )
      return channel
    }
  }
}
