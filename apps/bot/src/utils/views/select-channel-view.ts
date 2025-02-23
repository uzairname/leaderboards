import {
  AnyGuildInteractionContext,
  AnySignature,
  ChatInteractionResponse,
  ComponentContext,
  InteractionContext,
  ViewSignature,
  ViewState,
} from '@repo/discord'
import { field, StringField } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'

export const select_channel_view_sig = new ViewSignature({
  name: 'select channel',
  custom_id_prefix: 'sc',
  state_schema: {
    origin_cid: field.String(),
    channel_id_field: field.String(),

    text_only: field.Boolean(),

    selected_channel_id: field.String(),
    callback: field.Choice({
      onSelectChannel,
    }),
  },
})

export const select_channel_view = select_channel_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    if (ctx.state.data.callback) return ctx.state.data.callback(app, ctx)

    return ctx.defer(async ctx => {
        return void ctx.edit(await _selectChannelPage(app, ctx))
      },
    )
  },
})

export async function renderSelectChannelPage(
  app: App,
  ctx: AnyGuildInteractionContext,
  data: ViewState<typeof select_channel_view_sig.state_schema>['data'],
  back_view: AnySignature,
  back_state: typeof back_view & { channel_id: StringField },
  message?: string,
): Promise<D.APIInteractionResponseCallbackData> {
  return await _selectChannelPage(
    app,
    {
      ...ctx,
      state: select_channel_view_sig.newState(data),
    },
    message,
  )
}

async function _selectChannelPage(
  app: App,
  ctx: InteractionContext<typeof select_channel_view_sig>,
  message?: string,
): Promise<D.APIInteractionResponseCallbackData> {
  let btns: D.APIButtonComponent[] = [
    {
      type: D.ComponentType.Button,
      custom_id: app.view_manager
        .fromCustomId(ctx.state.get.origin_cid())
        .state.set[ctx.state.get.channel_id_field()](undefined)
        .cId(),
      label: 'Cancel',
      style: D.ButtonStyle.Danger,
    },
  ]

  if (ctx.state.is.selected_channel_id()) {
    btns = [
      {
        type: D.ComponentType.Button,
        custom_id: app.view_manager
          .fromCustomId(ctx.state.get.origin_cid())
          .state.set[ctx.state.get.channel_id_field()](ctx.state.data.selected_channel_id)
          .cId(),
        label: 'Submit',
        style: D.ButtonStyle.Success,
      },
      ...btns,
    ]
  }

  return {
    content:
      (message ? `${message}\n` : ``) +
      (ctx.state.is.selected_channel_id() ? `Selected channel: <#${ctx.state.data.selected_channel_id}>` : ``),
    embeds: [],
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.ChannelSelect,
            custom_id: ctx.state.set.callback(onSelectChannel).cId(),
            placeholder: 'select a channel',
            default_values: ctx.state.data.selected_channel_id
              ? [
                  {
                    type: D.SelectMenuDefaultValueType.Channel,
                    id: ctx.state.data.selected_channel_id,
                  },
                ]
              : [],
          },
        ],
      },
      {
        type: D.ComponentType.ActionRow,
        components: btns,
      },
    ],
    flags: D.MessageFlags.Ephemeral,
  }
}

function onSelectChannel(app: App, ctx: ComponentContext<typeof select_channel_view_sig>): ChatInteractionResponse {
  ctx.state.save.selected_channel_id((ctx.interaction.data as D.APIMessageStringSelectInteractionData).values?.[0])

  return ctx.defer(async ctx => ctx.edit(await _selectChannelPage(app, ctx)),
  )
}
