import * as D from 'discord-api-types/v10'
import type { AutocompleteContext, ViewAutocompleteCallback } from '../../../discord-framework'
import type { App } from '../../app/app'
import { checkGuildInteraction } from './checks'

export const create_choice_value = 'create'

export function rankingsAutocomplete(
  app: App,
  create_choice?: boolean,
  ranking_option_name: string = 'ranking',
): ViewAutocompleteCallback<D.ApplicationCommandType.ChatInput> {
  return async function (ctx: AutocompleteContext) {
    const interaction = checkGuildInteraction(ctx.interaction)

    // Get the ranking name typed so far.
    const input_value =
      (
        interaction.data.options?.find(o => o.name === ranking_option_name) as
          | D.APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value ?? ''

    // Get rankings in this guild
    const guild_rankings = await app.db.guild_rankings.get({ guild_id: interaction.guild_id })

    // Filter the rankings by name and map them to an array of choices.
    const choices: D.APIApplicationCommandOptionChoice[] = guild_rankings
      .filter(
        item =>
          // if no input so far, include all rankings
          !input_value || item.ranking.data.name?.toLowerCase().includes(input_value.toLowerCase()),
      )
      .map(lb => ({
        name: lb.ranking.data.name || 'Unnamed ranking',
        value: lb.ranking.data.id.toString(),
      }))

    if (create_choice || choices.length == 0) {
      // Add a choice to create a new ranking.
      choices.push({
        name: 'Create a new ranking',
        value: create_choice_value,
      })
    }

    const response: D.APIApplicationCommandAutocompleteResponse = {
      type: D.InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: {
        choices,
      },
    }

    return response
  }
}

/**
 * Returns a non-empty array of slash command choices for each ranking in the guild.
 *
 */
export async function guildRankingsOptionChoices(
  app: App,
  guild_id: string,
  create_ranking_option?: boolean,
): Promise<D.APIApplicationCommandOptionChoice<string>[]> {
  const choices = await app.db.guild_rankings.get({ guild_id }).then(guild_rankings =>
    guild_rankings.map(item => ({
      name: item.ranking.data.name ?? 'Unnamed Ranking',
      value: item.ranking.data.id.toString(),
    })),
  )

  if (create_ranking_option) {
    choices.push({
      name: 'Create a new ranking',
      value: create_choice_value,
    })
  }

  if (choices.length == 0) {
    choices.push({
      name: 'No rankings',
      value: '0',
    })
  }

  return choices
}
