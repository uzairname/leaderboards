import {
  APIActionRowComponent,
  APIApplicationCommandInteractionDataStringOption,
  APIInteractionResponseChannelMessageWithSource,
  APIMessageActionRowComponent,
  APIMessageSelectMenuInteractionData,
  APIMessageUserSelectInteractionData,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import {
  ChoiceField,
  ListField,
  NumberField,
  CommandView,
  BaseContext,
} from '../../../discord-framework'
import { assertValue } from '../../../utils/utils'
import { sentry } from '../../../logging/globals'

import { App } from '../../app'

const temp_command = new CommandView({
  type: ApplicationCommandType.ChatInput,
  command: {
    name: 'temp',
    description: 'record a match',
  },
  custom_id_prefix: 'tmp',
  state_schema: {
    clicked_component: new ChoiceField({
      'select team': null,
      'confirm match': null,
    }),
    selected_team: new NumberField(),
    players: new ListField(),
  },
})

export default (app: App) =>
  temp_command
    .onCommand(async (ctx) => {
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          components: await selectTeamComponents(app, ctx),
          flags: MessageFlags.Ephemeral,
        },
      }
    })

    .onComponent(async (ctx) => {
      if (ctx.state.data.clicked_component == 'select team') {
        let data = ctx.interaction.data as unknown as APIMessageUserSelectInteractionData
        const selected_player_ids = data.values

        const players_per_team = 1
        const num_teams = 2

        let current_players =
          ctx.state.data.players?.slice() ?? new Array(players_per_team * num_teams).fill('0')

        assertValue(ctx.state.data.selected_team)
        for (let i = 0; i < players_per_team; i++) {
          current_players[ctx.state.data.selected_team * players_per_team + i] =
            selected_player_ids[i]
        }

        ctx.state.save.players(current_players)

        if (current_players.every((p) => p != '0')) {
          return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: `Data: ${JSON.stringify(ctx.state.data)}`,
              components: [
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      label: 'Confirm',
                      style: ButtonStyle.Success,
                      custom_id: ctx.state.set.clicked_component('confirm match').encode(),
                    },
                  ],
                },
              ],
              flags: MessageFlags.Ephemeral,
            },
          }
        }

        return {
          type: InteractionResponseType.UpdateMessage,
          data: {
            content: `Data: ${JSON.stringify(ctx.state.data)}`,
            components: await selectTeamComponents(app, ctx),
            flags: MessageFlags.Ephemeral,
          },
        }
      }
    })

async function selectTeamComponents(
  app: App,
  ctx: BaseContext<typeof temp_command>,
): Promise<APIActionRowComponent<APIMessageActionRowComponent>[]> {
  const components: APIActionRowComponent<APIMessageActionRowComponent>[] = [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.UserSelect,
          placeholder: `Team ${1}`,
          custom_id: ctx.state.set.selected_team(0).set.clicked_component('select team').encode(),
          min_values: 1,
          max_values: 1,
        },
      ],
    },

    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.UserSelect,
          placeholder: `Team ${2}`,
          custom_id: ctx.state.set.selected_team(1).set.clicked_component('select team').encode(),
          min_values: 1,
          max_values: 1,
        },
      ],
    },
  ]

  return components
}
