import {
  APIActionRowComponent,
  APIMessageActionRowComponent,
  APIMessageUserSelectInteractionData,
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
} from 'discord-api-types/v10'

import { assertValue } from '../../../utils/utils'
import { ChoiceField, NumberField, ListField, CommandView } from '../../../discord-framework'

import { App } from '../../app'
import { AppErrors, UserErrors } from '../../errors'

const start_match_command = new CommandView({
  type: ApplicationCommandType.ChatInput,
  command: {
    name: 'start-match',
    description: 'description',
  },
  custom_id_prefix: 'sm',
  state_schema: {
    component: new ChoiceField({
      'confirm players': null,
      'select team': null,
    }),
    selected_team: new NumberField(),
    players: new ListField(),
    ranking_id: new NumberField(),
  },
})

export default (app: App) =>
  start_match_command
    .onCommand(async (ctx) => {
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: 'test',
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.UserSelect,
                  placeholder: 'Team 1',
                  custom_id: ctx.state.set.component('select team').set.selected_team(0).encode(),
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
                  placeholder: 'Team 2',
                  custom_id: ctx.state.set.component('select team').set.selected_team(1).encode(),
                  min_values: 1,
                  max_values: 1,
                },
              ],
            },
          ],
          flags: 64,
        },
      }
    })
    .onComponent(async (ctx) => {
      let data = ctx.state.data

      let num_teams = 2
      let players_per_team = 1
      let selected_players = data.players || new Array<string>(num_teams * players_per_team)

      if (ctx.state.is.component('select team')) {
        let selected_team_num = data.selected_team
        assertValue(selected_team_num)

        let interaction = ctx.interaction.data as unknown as APIMessageUserSelectInteractionData

        for (let i = 0; i < players_per_team; i++) {
          selected_players[selected_team_num * players_per_team + i] = interaction.values[i]
        }
        ctx.state.save.players(selected_players)

        let components: APIActionRowComponent<APIMessageActionRowComponent>[] = [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.UserSelect,
                placeholder: 'Team 1',
                custom_id: ctx.state.set.component('select team').set.selected_team(0).encode(),
                min_values: players_per_team,
                max_values: players_per_team,
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.UserSelect,
                placeholder: 'Team 2',
                custom_id: ctx.state.set.component('select team').set.selected_team(1).encode(),
                min_values: players_per_team,
                max_values: players_per_team,
              },
            ],
          },
        ]

        if (selected_players.filter((p) => p).length == selected_players.length) {
          components.push({
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                label: 'Confirm',
                custom_id: ctx.state.set.component('confirm players').encode(),
                style: ButtonStyle.Success,
              },
            ],
          })
        }

        return {
          type: InteractionResponseType.UpdateMessage,
          data: {
            components,
            flags: 64,
          },
        }
      } else if (ctx.state.is.component('confirm players')) {
        return {
          type: InteractionResponseType.UpdateMessage,
          data: {
            content:
              'Starting match between ' + selected_players.map((p) => '<@' + p + '>').join(' '),
            flags: 64,
          },
        }
      } else {
        throw new AppErrors.UnknownState(ctx.state.data.component)
      }
    })
