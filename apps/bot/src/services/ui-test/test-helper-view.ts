import { ChatInteractionResponse, ComponentContext, ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'

export const test_helper_view_config = new ViewSignature({
  name: 'test helper',
  custom_id_prefix: 'th',
  state_schema: {
    back_cid: field.String(),
    back_state: field.String(),
    back_counter_field: field.String(),

    counter: field.Int(),
    clicked_component: field.Enum({
      halve: null,
      submit: null,
    }),
  },
})

async function onTestHelperComponent(
  ctx: ComponentContext<typeof test_helper_view_config>,
  app: App,
): Promise<ChatInteractionResponse> {
  const { state: back_state } = app.interactionHandler.fromCustomId(ctx.state.get.back_cid())

  back_state.save[ctx.state.get.back_counter_field()](ctx.state.data.counter)

  return ctx.defer(async ctx => {
    const new_counter =
      ctx.state.data.clicked_component === 'halve'
        ? (ctx.state.data.counter ?? 0) / 2
        : (ctx.state.data.counter ?? 0) + 1

    return void (await ctx.edit({
      components: [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.Button,
              label: 'halve',
              custom_id: ctx.state.set.counter(new_counter / 2).cId(),
              style: D.ButtonStyle.Secondary,
            },
            {
              type: D.ComponentType.Button,
              label: `Submit: ${new_counter}`,
              custom_id: back_state.cId(),
              style: D.ButtonStyle.Secondary,
            },
          ],
        },
      ],
    }))
  })
}

export const test_helper_view = test_helper_view_config.set<App>({
  onComponent: onTestHelperComponent,
})
