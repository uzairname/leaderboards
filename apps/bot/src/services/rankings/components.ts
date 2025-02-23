import { Ranking, ScoringMethod } from '@repo/db/models'
import { AnyComponentContext, StateContext } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../logging/sentry'
import { App } from '../../setup/app'
import { default_players_per_team, default_teams_per_match, max_ranking_name_length } from './ranking-properties'
import * as handlers from './views/ranking-settings-handlers'
import { ranking_settings_view_sig } from './views/ranking-settings-view'
import { onCreateRankingModalSubmit, rankings_view_sig } from './views/rankings-view'

/**
 * If name is specified and current name is not provided, it will be required
 * @param include Which fields to include, along with their current value
 * @returns
 */
export function rankingSettingsModal(include: {
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

/**
 * The same as the Ranking Settings Modal but with the name field required
 */
export function createRankingModal(
  app: App,
  ctx: StateContext<typeof rankings_view_sig>,
): D.APIModalInteractionResponse {
  let components = rankingSettingsModal({
    name: {
      current: ctx.state.data.modal_input?.name,
    },
    best_of: {},
    team_size: app.config.features.AllowNon1v1 ? {} : undefined,
  })

  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.callback(onCreateRankingModalSubmit).cId(),
      title: 'Create a new ranking',
      components,
    },
  }
}

/**
 * Select menu to select a scoring method.
 * Redirects to the ranking settings page's scoring method select handler
 */
export async function selectScoringMethod(
  app: App,
  ctx: AnyComponentContext,
  ranking: Ranking,
): Promise<D.APIInteractionResponseCallbackData> {
  const state = ranking_settings_view_sig.newState({
    guild_id: ctx.interaction.guild_id,
  })

  return {
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.StringSelect,
            custom_id: ctx.state.set.handler(handlers.onScoringMethodSelect).cId(),
            placeholder: 'Select a scoring method',
            options: [
              {
                label: 'Trueskill2',
                value: ScoringMethod.TrueSkill.toString(),
                description: `Microsoft's TrueSkill2 ranking algorithm`,
              },
              {
                label: 'Elo',
                value: ScoringMethod.Elo.toString(),
                description: `Standard Elo rating system used in Chess`,
              },
              {
                label: 'Wins - Losses',
                value: ScoringMethod.WinsMinusLosses.toString(),
                description: `1 point for a win, lose a point for a loss`,
              },
            ],
          },
        ],
      },
    ],
  }
}
