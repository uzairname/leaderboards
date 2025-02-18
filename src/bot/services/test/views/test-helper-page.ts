import * as D from 'discord-api-types/v10'
import { MessageView } from '../../../../discord-framework'
import { ViewStateFactory } from '../../../../discord-framework/interactions/view-state'
import { field } from '../../../../utils/StringData'
import all_views from '../../all-views'
import { AppView } from '../../ViewModule'

export const helper_page_config = new MessageView({
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

const test_helper_view = new AppView(helper_page_config, app =>
  helper_page_config.onComponent(async ctx => {
    const x = all_views.getFindViewCallback(app)

    const { state: back_state } = ViewStateFactory.fromCustomId(
      ctx.state.get.back_cid(),
      all_views.findViewSignatureFromCustomId(),
    )

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
  }),
)

export default test_helper_view.dev()
