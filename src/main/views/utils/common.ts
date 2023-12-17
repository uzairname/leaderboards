import * as D from 'discord-api-types/v10'
import type { AutocompleteContext, ViewAutocompleteCallback } from '../../../discord-framework'
import type { App } from '../../app/app'
import { checkGuildInteraction } from './checks'

export const create_choice_value = 'create'

export function rankingsAutocomplete(
  app: App,
  create_choice?: boolean,
  ranking_option_name: string = 'ranking'
): ViewAutocompleteCallback<D.ApplicationCommandType.ChatInput> {
  return autocompleteTimeout(async (ctx: AutocompleteContext) => {
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
          !input_value || item.ranking.data.name?.toLowerCase().includes(input_value.toLowerCase())
      )
      .map(lb => ({
        name: lb.ranking.data.name || 'Unnamed ranking',
        value: lb.ranking.data.id.toString()
      }))

    if (create_choice || choices.length == 0) {
      // Add a choice to create a new ranking.
      choices.push({
        name: 'Create a new ranking',
        value: create_choice_value
      })
    }

    const response: D.APIApplicationCommandAutocompleteResponse = {
      type: D.InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: {
        choices
      }
    }

    return response
  })
}

function autocompleteTimeout(
  callback: ViewAutocompleteCallback<D.ApplicationCommandType.ChatInput>,
  message?: string
): ViewAutocompleteCallback<D.ApplicationCommandType.ChatInput> {
  return async function (ctx: AutocompleteContext) {
    return Promise.race([
      callback(ctx),
      new Promise<D.APIApplicationCommandAutocompleteResponse>(resolve =>
        setTimeout(() => {
          resolve({
            type: D.InteractionResponseType.ApplicationCommandAutocompleteResult,
            data: {
              choices: [
                {
                  name: message || 'Loading options timed out... type something to refresh',
                  value: ''
                }
              ]
            }
          })
        }, 2750)
      )
    ])
  }
}
