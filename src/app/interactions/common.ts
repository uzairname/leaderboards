import {
  APIApplicationCommandAutocompleteResponse,
  APIApplicationCommandInteractionDataStringOption,
  APIApplicationCommandOptionChoice,
  ApplicationCommandType,
  InteractionResponseType,
} from 'discord-api-types/v10'
import { AutocompleteContext, ViewAutocompleteCallback } from '../../discord-framework'
import { App } from '../app'
import { getOrAddGuild } from '../modules/guilds'
import { checkGuildInteraction } from './checks'

export function rankingsAutocomplete(
  app: App,
  create_new_choice?: boolean,
): ViewAutocompleteCallback<ApplicationCommandType.ChatInput> {
  return async (ctx: AutocompleteContext) => {
    const interaction = checkGuildInteraction(ctx.interaction)

    // Get the ranking name typed so far.
    const input_value =
      (
        interaction.data.options?.find((o) => o.name === 'ranking') as
          | APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value ?? ''

    // Get rankings in this guild
    const guild = await getOrAddGuild(app, interaction.guild_id)
    const guild_lbs = await guild.guildRankings()

    // Filter the rankings by name and map them to an array of choices.
    const choices: APIApplicationCommandOptionChoice[] = guild_lbs
      .filter(
        (lb) =>
          // if no input so far, include all rankings
          !input_value || lb.ranking.data.name?.toLowerCase().includes(input_value.toLowerCase()),
      )
      .map((lb) => ({
        name: lb.ranking.data.name || 'Unnamed ranking',
        value: lb.ranking.data.id.toString(),
      }))

    if (create_new_choice || choices.length == 0) {
      // Add a choice to create a new ranking.
      choices.push({
        name: 'Create a new ranking',
        value: 'create',
      })
    }

    const response: APIApplicationCommandAutocompleteResponse = {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: {
        choices,
      },
    }

    return response
  }
}
