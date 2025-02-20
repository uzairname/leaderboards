import * as D from 'discord-api-types/v10'

export function isSubCommandOption(
  option: D.APIApplicationCommandInteractionDataOption | undefined,
): option is D.APIApplicationCommandInteractionDataSubcommandOption {
  return option?.type === D.ApplicationCommandOptionType.Subcommand
}
