import * as D from 'discord-api-types/v10'
import {
  ChatInteractionResponse,
  ComponentContext,
  InteractionContext,
  MessageView,
  StateContext,
  _,
  field,
} from '../../../discord-framework'
import { ViewState } from '../../../discord-framework/interactions/view_state'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'
import { findView } from '../../app/find_view'
import { checkGuildInteraction } from '../utils/checks'

export const select_channel_view = new MessageView({
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
  select_channel_view.onComponent(async ctx => {
    if (ctx.state.is.callback()) return ctx.state.get('callback')(app, ctx)

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredMessageUpdate,
      },
      async ctx => {
        return void ctx.edit(await selectChannelPage(app, ctx))
      },
    )
  })

async function selectChannelPage(
  app: App,
  ctx: InteractionContext<typeof select_channel_view>,
): Promise<D.APIInteractionResponseCallbackData> {
  const channels = (
    await app.bot.getGuildChannels(checkGuildInteraction(ctx.interaction).guild_id)
  ).filter(c => !ctx.state.data.text_only || c.type === D.ChannelType.GuildText)

  let btns: D.APIButtonComponent[] = [
    {
      type: D.ComponentType.Button,
      custom_id: (
        await ViewState.fromCustomId(ctx.state.get('submit_cid'), findView(app))
      ).state.set[ctx.state.get('channel_id_field')](undefined).cId(),
      label: 'Cancel',
      style: D.ButtonStyle.Danger,
    },
  ]

  if (ctx.state.is.selected_channel_id()) {
    btns = [
      {
        type: D.ComponentType.Button,
        custom_id: (
          await ViewState.fromCustomId(ctx.state.get('submit_cid'), findView(app))
        ).state.set[ctx.state.get('channel_id_field')](ctx.state.data.selected_channel_id).cId(),
        label: 'Submit',
        style: D.ButtonStyle.Success,
      },
      ...btns,
    ]
  }

  if (channels.length <= 25) {
    return {
      content: ctx.state.is.selected_channel_id()
        ? `Selected channel: <#${ctx.state.data.selected_channel_id}>`
        : ``,
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
    }
  } else {
    throw new AppErrors.NotImplimented()
  }
}

function onNextBtn(
  app: App,
  ctx: ComponentContext<typeof select_channel_view>,
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
  ctx: ComponentContext<typeof select_channel_view>,
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
  ctx: ComponentContext<typeof select_channel_view>,
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
