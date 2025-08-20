import { ActionRowBuilder, ModalBuilder, TextInputBuilder } from '@discordjs/builders'
import { RatingStrategy } from '@repo/db/models'
import * as D from 'discord-api-types/v10'
import { max_ranking_name_length, DEFAULT_TEAMS_PER_MATCH, DEFAULT_PLAYERS_PER_TEAM, default_best_of, DEFAULT_LB_COLOR } from '../../../api/rankings/properties'

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
  const example_names = [
    `Smash 1v1`,
    `Ping Pong`,
    `Tennis Doubles`,
    `Chess`,
    `Tic Tac Toe`,
    `Valorant 5s`,
    `Halo 8s`,
    `Hearthstone`,
  ]

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
          placeholder: `${include.team_size.teams_per_match.ph ?? DEFAULT_TEAMS_PER_MATCH}`,
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
          placeholder: `${include.team_size.players_per_team.ph ?? DEFAULT_PLAYERS_PER_TEAM}`,
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
        placeholder: `${include.color.ph ?? DEFAULT_LB_COLOR}`,
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

export function ratingParametersModal(rating_strategy: RatingStrategy) {
  const text_inputs: {
    custom_id: string
    label: string
  }[] = []
  let title = 'Rating Parameters'

  if (rating_strategy === RatingStrategy.TrueSkill) {
    // Parameters: mu, sigma
    title = 'TrueSkill Parameters'

    text_inputs.push({
      custom_id: 'mu',
      label: 'Mu (Mean Rating)',
    })
    text_inputs.push({
      custom_id: 'sigma',
      label: 'Sigma (Standard Deviation)',
    })
  } else if (rating_strategy === RatingStrategy.Glicko) {
    // Parameters: mu, sigma, tau, volatility

    title = 'Glicko Parameters'

    text_inputs.push({
      custom_id: 'mu',
      label: 'Mu (Mean Rating)',
    })

    text_inputs.push({
      custom_id: 'sigma',
      label: 'Sigma (Standard Deviation)',
    })

    text_inputs.push({
      custom_id: 'tau',
      label: 'Tau (Decay Rate)',
    })

    text_inputs.push({
      custom_id: 'volatility',
      label: 'Volatility',
    })
  } else if (rating_strategy === RatingStrategy.Elo) {
    // Parameters: mu, k_factor

    title = 'Elo Parameters'

    text_inputs.push({
      custom_id: 'mu',
      label: 'Mu (Mean Rating)',
    })

    text_inputs.push({
      custom_id: 'sigma',
      label: 'Sigma (Standard Deviation)',
    })

    text_inputs.push({
      custom_id: 'k_factor',
      label: 'K Factor',
    })
  } else if (rating_strategy === RatingStrategy.Bayesian) {
    // Parameters: mu, sigma, tau

    title = 'Bayesian Parameters'

    text_inputs.push({
      custom_id: 'mu',
      label: 'Mu (Mean Rating)',
    })

    text_inputs.push({
      custom_id: 'sigma',
      label: 'Sigma (Standard Deviation)',
    })
  }

  if (text_inputs.length == 0) {
    return undefined
  }

  return new ModalBuilder({
    title,
    components: text_inputs.map((input, i) =>
      new ActionRowBuilder<TextInputBuilder>()
        .setComponents(
          new TextInputBuilder({
            type: D.ComponentType.TextInput,
            style: D.TextInputStyle.Short,
            placeholder: `Leave blank to not change`,
            required: false,
            ...input,
          }),
        )
        .toJSON(),
    ),
  })
}
