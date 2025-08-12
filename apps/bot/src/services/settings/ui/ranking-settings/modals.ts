import { ActionRowBuilder, ModalBuilder, TextInputBuilder } from '@discordjs/builders'
import * as D from 'discord-api-types/v10'
import {
  default_best_of,
  default_leaderboard_color,
  default_players_per_team,
  default_teams_per_match,
  max_ranking_name_length,
} from '../../properties'

/**
 * If name is specified and current name is not provided, it will be required
 * @param include Which fields to include, along with their placeholder value
 * @returns A modal builder without title or custom id.
 */
export function rankingSettingsModal(include: {
  name?: { ph?: string }
  best_of?: { ph?: number }
  team_size?: {
    players_per_team?: { ph?: number }
    teams_per_match?: { ph?: number }
  }
  color?: { ph?: string }
}) {
  const example_names = [`Smash 1v1`, `Boosts Only`, `Ping Pong 2v2`, `Chess`]

  const text_inputs: TextInputBuilder[] = []

  if (include?.name) {
    text_inputs.push(
      new TextInputBuilder({
        type: D.ComponentType.TextInput,
        style: D.TextInputStyle.Short,
        custom_id: 'name',
        label: 'Name',
        placeholder: include?.name?.ph ?? `e.g. ${example_names[Math.floor(Math.random() * example_names.length)]}`,
        max_length: max_ranking_name_length,
        required: !include?.name?.ph,
      }),
    )
  }

  if (include?.team_size) {
    if (include.team_size.teams_per_match) {
      text_inputs.push(
        new TextInputBuilder({
          type: D.ComponentType.TextInput,
          style: D.TextInputStyle.Short,
          custom_id: 'teams_per_match',
          label: 'Number of teams per match',
          placeholder: `${include.team_size.teams_per_match.ph ?? default_teams_per_match}`,
          required: false,
        }),
      )
    }
    if (include.team_size.players_per_team) {
      text_inputs.push(
        new TextInputBuilder({
          type: D.ComponentType.TextInput,
          style: D.TextInputStyle.Short,
          custom_id: 'players_per_team',
          label: 'Players per team',
          placeholder: `${include.team_size.players_per_team.ph ?? default_players_per_team}`,
          required: false,
        }),
      )
    }
  }

  if (include?.best_of) {
    text_inputs.push(
      new TextInputBuilder({
        type: D.ComponentType.TextInput,
        style: D.TextInputStyle.Short,
        custom_id: 'best_of',
        label: 'Best of',
        placeholder: `${include.best_of.ph ?? default_best_of}`,
        required: false,
      }),
    )
  }

  if (include?.color) {
    text_inputs.push(
      new TextInputBuilder({
        type: D.ComponentType.TextInput,
        style: D.TextInputStyle.Short,
        custom_id: 'color',
        label: 'Color',
        placeholder: `${include.color.ph ?? default_leaderboard_color}`,
        required: false,
      }),
    )
  }

  if (text_inputs.length == 0) throw new Error('No text input components in modal')

  const components = text_inputs.map((input, i) =>
    new ActionRowBuilder<TextInputBuilder>().setComponents(input).toJSON(),
  )

  return new ModalBuilder({
    components,
  })
}
