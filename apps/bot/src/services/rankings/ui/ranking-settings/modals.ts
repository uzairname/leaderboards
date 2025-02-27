import * as D from 'discord-api-types/v10'
import { sentry } from '../../../../logging/sentry'
import { default_players_per_team, default_teams_per_match, max_ranking_name_length } from '../../properties'

/**
 * If name is specified and current name is not provided, it will be required
 * @param include Which fields to include, along with their current value
 * @returns
 */
export function rankingSettingsModalComponents(include: {
  name?: { current?: string }
  best_of?: { current?: number }
  team_size?: {
    players_per_team?: number
    teams_per_match?: number
  }
}): D.APIActionRowComponent<D.APITextInputComponent>[] {
  const example_names = [`Smash 1v1`, `Boosts Only`, `Ping Pong 1v1`, `Chess`]

  const components: D.APIActionRowComponent<D.APIModalActionRowComponent>[] = []

  sentry.debug(`${JSON.stringify(include)}`)

  if (include.name) {
    components.push({
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.TextInput,
          style: D.TextInputStyle.Short,
          custom_id: 'name',
          label: 'Name',
          placeholder:
            include?.name?.current ?? `e.g. ${example_names[Math.floor(Math.random() * example_names.length)]}`,
          max_length: max_ranking_name_length,
          required: !include?.name?.current,
        },
      ],
    })
  }

  if (include.team_size) {
    components.push({
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.TextInput,
          style: D.TextInputStyle.Short,
          custom_id: 'teams_per_match',
          label: 'Number of teams per match',
          placeholder: `${include.team_size.teams_per_match ?? default_teams_per_match}`,
          required: false,
        },
      ],
    })
    components.push({
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.TextInput,
          style: D.TextInputStyle.Short,
          custom_id: 'players_per_team',
          label: 'Players per team',
          placeholder: `${include.team_size.players_per_team ?? default_players_per_team}`,
          required: false,
        },
      ],
    })
  }

  if (include?.best_of) {
    components.push({
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.TextInput,
          style: D.TextInputStyle.Short,
          custom_id: 'best_of',
          label: 'By default, matches are best of:',
          placeholder: include?.best_of?.current?.toString() ?? '1',
          required: false,
        },
      ],
    })
  }

  return components
}
