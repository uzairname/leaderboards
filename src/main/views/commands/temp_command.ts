import * as D from 'discord-api-types/v10'
import {
  ChatInteractionContext,
  ChoiceField,
  CommandView,
  Context,
  IntField,
  ListField,
  _
} from '../../../discord-framework'
import { sentry } from '../../../request/sentry'
import { nonNullable } from '../../../utils/utils'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'

const temp_command = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  command: {
    name: 'temp',
    description: 'record a match'
  },
  custom_id_prefix: 'tmp',
  state_schema: {
    clicked_component: new ChoiceField({
      'select team': _,
      'confirm match': _
    }),
    selected_team: new IntField(),
    players: new ListField()
  }
})

export default (app: App) =>
  temp_command
    .onCommand(async ctx => {
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: {
          components: await selectTeamComponents(app, ctx),
          flags: D.MessageFlags.Ephemeral
        }
      }
    })

    .onComponent(async ctx => {
      if (ctx.state.data.clicked_component == 'select team') {
        let data = ctx.interaction.data as unknown as D.APIMessageUserSelectInteractionData
        const selected_player_ids = data.values

        const players_per_team = 1
        const num_teams = 2

        let current_players =
          ctx.state.data.players?.slice() ?? new Array(players_per_team * num_teams).fill('0')

        const selected_team = ctx.state.get('selected_team')
        for (let i = 0; i < players_per_team; i++) {
          current_players[selected_team * players_per_team + i] = selected_player_ids[i]
        }

        ctx.state.save.players(current_players)

        if (current_players.every(p => p != '0')) {
          return {
            type: D.InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: `Data: ${JSON.stringify(ctx.state.data)}`,
              components: [
                {
                  type: D.ComponentType.ActionRow,
                  components: [
                    {
                      type: D.ComponentType.Button,
                      label: 'Confirm',
                      style: D.ButtonStyle.Success,
                      custom_id: ctx.state.set.clicked_component('confirm match').encode()
                    }
                  ]
                }
              ],
              flags: D.MessageFlags.Ephemeral
            }
          }
        }

        return {
          type: D.InteractionResponseType.UpdateMessage,
          data: {
            content: `Data: ${JSON.stringify(ctx.state.data)}`,
            components: await selectTeamComponents(app, ctx),
            flags: D.MessageFlags.Ephemeral
          }
        }
      } else {
        throw new AppErrors.UnknownState(ctx.state.data.clicked_component)
      }
    })

async function selectTeamComponents(
  app: App,
  ctx: Context<typeof temp_command>
): Promise<D.APIActionRowComponent<D.APIMessageActionRowComponent>[]> {
  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
    {
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.UserSelect,
          placeholder: `Team ${1}`,
          custom_id: ctx.state.set.selected_team(0).set.clicked_component('select team').encode(),
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
          placeholder: `Team ${2}`,
          custom_id: ctx.state.set.selected_team(1).set.clicked_component('select team').encode(),
          min_values: 1,
          max_values: 1
        }
      ]
    }
  ]

  return components
}
