import * as D from 'discord-api-types/v10'
import { CommandView, StateContext } from '../../../../../discord-framework'
import { AppView } from '../../../../app/ViewModule'
import { UserErrors } from '../../../errors/UserError'
import { helper_page_config } from './test-helper'
import { field } from '../../../../../utils/StringData'

const test_cmd_signature = new CommandView({
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


export default new AppView(test_cmd_signature, app =>
  test_cmd_signature
    .onCommand(async ctx => {
      const user_id = ctx.interaction.member.user.id
      ctx.state.save.original_user(user_id)
      ctx.state.save.counter(0)

      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: D.MessageFlags.Ephemeral },
        },
        async ctx => {
          await new Promise(r => setTimeout(r, 11000))
          return void (await ctx.edit(testMessageData(ctx, true)))
        },
      )

      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: { content: 'rescored matches', flags: D.MessageFlags.Ephemeral },
      }
    })
    .onComponent(async ctx => {
      const user_id = ctx.interaction.member.user.id

      if (ctx.state.data.original_user !== user_id) {
        throw new UserErrors.NotComponentOwner(ctx.state.data.original_user)
      }

      if (ctx.state.is.clicked_btn('wait')) {
        return ctx.defer(
          {
            type: D.InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: `waiting`,
              flags: D.MessageFlags.Ephemeral,
            },
          },
          async ctx => {
            const seconds = ctx.state.data.counter ?? 0

            await ctx.edit({
              content: `waiting....`,
            })

            await new Promise(r => setTimeout(r, seconds * 1000))

            return void ctx.followup({
              content: `waited ${seconds} seconds.`,
              flags: D.MessageFlags.Ephemeral,
            })
          },
        )
      } else if (ctx.state.is.clicked_btn('increment')) {
        ctx.state.save.counter((ctx.state.data.counter ?? 0) + 1)
      }

      return {
        type: D.InteractionResponseType.UpdateMessage,
        data: testMessageData(ctx),
      }
    }),
)



function testMessageData(
  ctx: StateContext<typeof test_cmd_signature>,
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
            custom_id: helper_page_config
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