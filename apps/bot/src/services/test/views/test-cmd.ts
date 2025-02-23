import { CommandSignature, StateContext } from '@repo/discord'
import { field } from '@repo/utils'
import { sentry } from 'apps/bot/src/logging/sentry'
import * as D from 'discord-api-types/v10'
import { UserErrors } from '../../../errors/user-errors'
import { App } from '../../../setup/app'
import { test_helper_view_config } from './test-helper-view'

const test_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'test',
  description: 'Test command',
  options: [
    {
      type: D.ApplicationCommandOptionType.User,
      name: 'user',
      description: 'The user to test',
    },
  ],
  custom_id_prefix: 'test',
  state_schema: {
    clicked_btn: field.Enum({ wait: null, increment: null, one: null, input: null }),
    counter: field.Int(),
    original_user: field.String(),
    input_date: field.Date(),
  },
  guild_only: true,
})

export const test_cmd = test_cmd_sig.set<App>({
  onCommand: async ctx => {
    const user_id = ctx.interaction.member.user.id
    ctx.state.save.original_user(user_id)
    ctx.state.save.counter(0)

    return ctx.defer(async ctx => {
        await new Promise(r => setTimeout(r, sentry.timeout_ms + 5000))
        return void (await ctx.edit(testMessageData(ctx, true)))
      },
    )

    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: { content: 'rescored matches', flags: D.MessageFlags.Ephemeral },
    }
  },
  onComponent: async ctx => {
    const user_id = ctx.interaction.member.user.id

    if (ctx.state.data.original_user !== user_id) {
      throw new UserErrors.NotComponentOwner(ctx.state.data.original_user)
    }

    if (ctx.state.is.clicked_btn('wait')) {
      return ctx.defer(async ctx => {
          const seconds = ctx.state.data.counter ?? 0

          await ctx.edit({
            content: `waiting....`,
          })

          await new Promise(r => setTimeout(r, seconds * 1000))

          return void ctx.followup({
            content: `waited ${seconds} seconds.`,
            flags: D.MessageFlags.Ephemeral,
          })
        }, {
          type: D.InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `waiting`,
            flags: D.MessageFlags.Ephemeral,
          },
        },
      )
    } else if (ctx.state.is.clicked_btn('increment')) {
      ctx.state.save.counter((ctx.state.data.counter ?? 0) + 1)
    }

    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: testMessageData(ctx),
    }
  },
})

function testMessageData(
  ctx: StateContext<typeof test_cmd_sig>,
  ephemeral: boolean = false,
): D.APIInteractionResponseCallbackData {
  return {
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            label: `Wait ${ctx.state.data.counter} seconds`,
            custom_id: ctx.state.set.clicked_btn('wait').cId(),
            style: D.ButtonStyle.Primary,
          },
          {
            type: D.ComponentType.Button,
            label: 'Increment',
            custom_id: ctx.state.set.clicked_btn('increment').cId(),
            style: D.ButtonStyle.Primary,
          },
          {
            type: D.ComponentType.Button,
            label: 'Input',
            custom_id: test_helper_view_config
              .newState({
                back_cid: ctx.state.set.clicked_btn('one').cId(),
                back_counter_field: 'counter',
                counter: ctx.state.data.counter ?? 0,
              })
              .cId(),
            style: D.ButtonStyle.Primary,
          },
        ],
      },
    ],
    flags: ephemeral ? D.MessageFlags.Ephemeral : undefined,
  }
}
