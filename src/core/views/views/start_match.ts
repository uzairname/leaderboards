import {
  APIActionRowComponent,
  APIMessageActionRowComponent,
  APIMessageUserSelectInteractionData,
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
} from 'discord-api-types/v10'

import { assertNonNullable } from '../../../utils/utils'
import { ChoiceField, NumberField, ListField } from '../../../discord/views/string_data'
import { CommandView } from '../../../discord/views/views'

import { App } from '../../app'
import { Errors } from '../../errors'

const start_match_command = new CommandView({
  type: ApplicationCommandType.ChatInput,
  command: {
    name: 'create-match',
    description: 'description',
  },
  custom_id_prefix: 'sm',
  state_schema: {
    component: new ChoiceField({
      'confirm players': null,
      'select team': null,
    }),
    team: new NumberField(),
    ffa: new NumberField(),
    num_teams: new NumberField(),
    players_per_team: new NumberField(),
    players: new ListField(),
    leaderboard_id: new NumberField(),
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
                  custom_id: ctx.state.set.component('select team').set.team(0).encode(),
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
                  custom_id: ctx.state.set.component('select team').set.team(1).encode(),
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

      let num_teams = data.num_teams
      assertNonNullable(num_teams)
      let players_per_team = data.players_per_team
      assertNonNullable(players_per_team)
      let selected_team_num = data.team
      assertNonNullable(selected_team_num)

      let all_players = data.players || new Array<string>(num_teams * players_per_team)

      if (ctx.state.is.component('select team')) {
        let interaction = ctx.interaction.data as unknown as APIMessageUserSelectInteractionData

        for (let i = 0; i < players_per_team; i++) {
          all_players[selected_team_num * players_per_team + i] = interaction.values[i]
        }
        ctx.state.save.players(all_players)

        let components: APIActionRowComponent<APIMessageActionRowComponent>[] = [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.UserSelect,
                placeholder: 'Team 1',
                custom_id: ctx.state.set.component('select team').set.team(0).encode(),
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
                custom_id: ctx.state.set.component('select team').set.team(1).encode(),
                min_values: players_per_team,
                max_values: players_per_team,
              },
            ],
          },
        ]

        if (all_players.filter((p) => p).length == all_players.length) {
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
            content: 'Done ' + all_players.map((p) => '<@' + p + '>').join(' '),
            flags: 64,
          },
        }
      } else {
        throw new Errors.UnknownState(ctx.state.data.component)
      }
    })
