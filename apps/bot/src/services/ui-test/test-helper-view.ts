import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'

export const test_helper_view_config = new ViewSignature({
  name: 'test helper',
  custom_id_prefix: 'th',
  state_schema: {
    back_cid: field.String(),
    // back_state: field.String(),
    back_counter_field: field.String(),

    counter: field.Int(),
    clicked_component: field.Enum({
      halve: null,
      submit: null,
    }),
  },
})

export const test_helper_view = test_helper_view_config.set<App>({
  onComponent: async (ctx, app) => {
    const { state: back_state } = app.view_manager.fromCustomId(ctx.state.get.back_cid())

    back_state.save[ctx.state.get.back_counter_field()](ctx.state.data.counter)

    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: {
        components: [
          {
            type: D.ComponentType.ActionRow,
            components: [
              {
                type: D.ComponentType.Button,
                label: 'halve',
                custom_id: ctx.state.set.counter((ctx.state.data.counter ?? 0) / 2).cId(),
                style: D.ButtonStyle.Secondary,
              },
              {
                type: D.ComponentType.Button,
                label: `Submit: ${ctx.state.data.counter}`,
                custom_id: back_state.cId(),
                style: D.ButtonStyle.Secondary,
              },
            ],
          },
        ],
      },
    } as any
  },
})
