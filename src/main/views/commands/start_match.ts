import * as D from 'discord-api-types/v10'
import { ChoiceField, CommandView, IntField, ListField, _ } from '../../../discord-framework'
import { nonNullable } from '../../../utils/utils'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'

const start_match_command = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  command: {
    name: 'start-match',
    description: 'description'
  },
  custom_id_prefix: 'sm',
  state_schema: {
    component: new ChoiceField({
      'confirm players': _,
      'select team': _
    }),
    selected_team: new IntField(),
    players: new ListField(),
    ranking_id: new IntField()
  }
})

export const startMatch = (app: App) =>
  start_match_command
    .onCommand(async ctx => {
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: 'test',
          components: [
            {
              type: D.ComponentType.ActionRow,
              components: [
                {
                  type: D.ComponentType.UserSelect,
                  placeholder: 'Team 1',
                  custom_id: ctx.state.set.component('select team').set.selected_team(0).encode(),
                  min_values: 1,
                  max_values: 1
                }
              ]
            },
            {
              type: D.ComponentType.ActionRow,
              components: [
                {
                  type: D.ComponentType.UserSelect,
                  placeholder: 'Team 2',
                  custom_id: ctx.state.set.component('select team').set.selected_team(1).encode(),
                  min_values: 1,
                  max_values: 1
                }
              ]
            }
          ],
          flags: D.MessageFlags.Ephemeral
        }
      }
    })
    .onComponent(async ctx => {
      let data = ctx.state.data

      let num_teams = 2
      let players_per_team = 1
      let selected_players = data.players || new Array<string>(num_teams * players_per_team)

      if (ctx.state.is.component('select team')) {
        let selected_team_num = nonNullable(data.selected_team, 'selected_team')

        let interaction = ctx.interaction.data as unknown as D.APIMessageUserSelectInteractionData

        for (let i = 0; i < players_per_team; i++) {
          selected_players[selected_team_num * players_per_team + i] = interaction.values[i]
        }
        ctx.state.save.players(selected_players)

        let components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
          {
            type: D.ComponentType.ActionRow,
            components: [
              {
                type: D.ComponentType.UserSelect,
                placeholder: 'Team 1',
                custom_id: ctx.state.set.component('select team').set.selected_team(0).encode(),
                min_values: players_per_team,
                max_values: players_per_team
              }
            ]
          },
          {
            type: D.ComponentType.ActionRow,
            components: [
              {
                type: D.ComponentType.UserSelect,
                placeholder: 'Team 2',
                custom_id: ctx.state.set.component('select team').set.selected_team(1).encode(),
                min_values: players_per_team,
                max_values: players_per_team
              }
            ]
          }
        ]

        if (selected_players.filter(p => p).length == selected_players.length) {
          components.push({
            type: D.ComponentType.ActionRow,
            components: [
              {
                type: D.ComponentType.Button,
                label: 'Confirm',
                custom_id: ctx.state.set.component('confirm players').encode(),
                style: D.ButtonStyle.Success
              }
            ]
          })
        }

        return {
          type: D.InteractionResponseType.UpdateMessage,
          data: {
            components,
            flags: D.MessageFlags.Ephemeral
          }
        }
      } else if (ctx.state.is.component('confirm players')) {
        return {
          type: D.InteractionResponseType.UpdateMessage,
          data: {
            content:
              'Starting match between ' + selected_players.map(p => '<@' + p + '>').join(' '),
            flags: D.MessageFlags.Ephemeral
          }
        }
      } else {
        throw new AppErrors.UnknownState(ctx.state.data.component)
      }
    })
