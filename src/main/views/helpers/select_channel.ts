import * as D from 'discord-api-types/v10'
import {
  AnyView,
  ChatInteraction,
  ChatInteractionResponse,
  ComponentContext,
  InteractionContext,
  MessageView,
  _,
  field,
} from '../../../discord-framework'
import { ViewState } from '../../../discord-framework/interactions/view_state'
import { App } from '../../app/app'
import { findView } from '../../modules/view_manager/manage_views'
import { checkGuildInteraction } from '../utils/checks'

export const select_channel_view_def = new MessageView({
  name: 'select channel',
  custom_id_prefix: 'sc',
  state_schema: {
    submit_cid: field.String(),
    channel_id_field: field.String(),

    text_only: field.Bool(),

    selected_channel_id: field.String(),
    page: field.Int(),
    callback: field.Choice({
      onSelectChannel,
      onNextBtn,
      onPrevBtn,
    }),
  },
})

export const selectChannelView = (app: App) =>
  select_channel_view_def.onComponent(async ctx => {
    if (ctx.state.data.callback) return ctx.state.data.callback(app, ctx)

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredMessageUpdate,
      },
      async ctx => {
        return void ctx.edit(await selectChannelPage(app, ctx))
      },
    )
  })

export async function sendSelectChannelPage(
  app: App,
  interaction: ChatInteraction,
  data: ViewState<typeof select_channel_view_def.state_schema>['data'],
  message?: string,
): Promise<D.APIInteractionResponseCallbackData> {
  return await selectChannelPage(
    app,
    {
      interaction,
      state: select_channel_view_def.newState(data),
    },
    message,
  )
}

async function selectChannelPage(
  app: App,
  ctx: InteractionContext<typeof select_channel_view_def>,
  message?: string,
): Promise<D.APIInteractionResponseCallbackData> {
  const channels = (
    await app.bot.getGuildChannels(checkGuildInteraction(ctx.interaction).guild_id)
  ).filter(c => !ctx.state.data.text_only || c.type === D.ChannelType.GuildText)

  let btns: D.APIButtonComponent[] = [
    {
      type: D.ComponentType.Button,
      custom_id: (
        await ViewState.fromCustomId(ctx.state.get.submit_cid(), findView(app))
      ).state.set[ctx.state.get.channel_id_field()](undefined).cId(),
      label: 'Cancel',
      style: D.ButtonStyle.Danger,
    },
  ]

  if (ctx.state.is.selected_channel_id()) {
    btns = [
      {
        type: D.ComponentType.Button,
        custom_id: (
          await ViewState.fromCustomId(ctx.state.get.submit_cid(), findView(app))
        ).state.set[ctx.state.get.channel_id_field()](ctx.state.data.selected_channel_id).cId(),
        label: 'Submit',
        style: D.ButtonStyle.Success,
      },
      ...btns,
    ]
  }

  return {
    content:
      (message ? `${message}\n` : ``) +
      (ctx.state.is.selected_channel_id()
        ? `Selected channel: <#${ctx.state.data.selected_channel_id}>`
        : ``),
    embeds: [],
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.StringSelect,
            custom_id: ctx.state.set.callback(onSelectChannel).cId(),
            placeholder: 'select a channel',
            options: channels.map(c => ({
              label: c.name ?? 'unknown',
              value: c.id,
              default: ctx.state.data.selected_channel_id === c.id,
            })),
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

function onNextBtn(
  app: App,
  ctx: ComponentContext<typeof select_channel_view_def>,
): ChatInteractionResponse {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => ctx.edit(await selectChannelPage(app, ctx)),
  )
}

function onPrevBtn(
  app: App,
  ctx: ComponentContext<typeof select_channel_view_def>,
): ChatInteractionResponse {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => ctx.edit(await selectChannelPage(app, ctx)),
  )
}

function onSelectChannel(
  app: App,
  ctx: ComponentContext<typeof select_channel_view_def>,
): ChatInteractionResponse {
  ctx.state.save.selected_channel_id(
    (ctx.interaction.data as D.APIMessageStringSelectInteractionData).values?.[0],
  )

  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => ctx.edit(await selectChannelPage(app, ctx)),
  )
}
