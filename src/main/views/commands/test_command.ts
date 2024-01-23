import * as D from 'discord-api-types/v10'
import { AppCommand, _, field, MessageView, StateContext } from '../../../discord-framework'
import { ViewState } from '../../../discord-framework/interactions/view_state'
import { sentry } from '../../../request/sentry'
import { maxIndex, nonNullable } from '../../../utils/utils'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'
import { Colors, escapeMd, relativeTimestamp } from '../../messages/message_pieces'
import { leaderboardMessage } from '../../modules/leaderboard/leaderboard_messages'
import { getRegisterPlayer } from '../../modules/players'
import { findView } from '../../modules/view_manager/manage_views'
import { ViewModule, globalView } from '../../modules/view_manager/view_module'
import { checkGuildInteraction } from '../utils/checks'

const test_command = new AppCommand({
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
    clicked_btn: field.Enum({ wait: _, increment: _, one: _, input: _ }),
    counter: field.Int(),
    original_user: field.String(),
    input_date: field.Date(),
  },
})

export const testCommand = (app: App) =>
  test_command
    .onCommand(async ctx => {
      const user_id = ctx.interaction.member?.user.id ?? ctx.interaction.user?.id
      ctx.state.save.original_user(user_id)
      ctx.state.save.counter(0)

      const user =
        (
          ctx.interaction.data.options?.find(o => o.name === 'user') as
            | D.APIApplicationCommandInteractionDataUserOption
            | undefined
        )?.value ?? true

      // const ephemeral = true
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: testMessageData(ctx, true),
      }
    })
    .onComponent(async ctx => {
      const user_id = ctx.interaction.member?.user.id ?? ctx.interaction.user?.id

      if (ctx.state.data.original_user !== user_id) {
        throw new AppErrors.NotComponentOwner(ctx.state.data.original_user)
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
    })

function testMessageData(
  ctx: StateContext<typeof test_command>,
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
            custom_id: helper_view
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

const helper_view = new MessageView({
  name: 'test helper',
  custom_id_prefix: 'th',
  state_schema: {
    back_cid: field.String(),
    // back_state: field.String(),
    back_counter_field: field.String(),

    counter: field.Int(),
    clicked_component: field.Enum({
      halve: _,
      submit: _,
    }),
  },
})

const helperView = (app: App) =>
  helper_view.onComponent(async ctx => {
    const back_state = (await ViewState.fromCustomId(ctx.state.get('back_cid'), findView(app)))
      .state

    back_state.save[ctx.state.get('back_counter_field')](ctx.state.data.counter)

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
    }
  })

export const test_module = new ViewModule([
  globalView(testCommand, true),
  globalView(helperView, true),
])

const schema = {
  originalUserId: field.String(),
  createdAt: field.Date(),
  current_page: field.Enum({
    settings: null,
    main: null,
    chat: null,
  }),
  clickedComponent: field.Enum({
    'button: add user': null,
    'button: delete': null,
    'modal: rename': null,
    'button: rename confirm': null,
  }),
  messages: field.Array(field.String()),
  isAdmin: field.Bool(),
  counter: field.Int(),
}

// // encode data

// const data1 = new StringData(schema)

// // Everything is type-safe

// // Save data, IN place with .save
// data1.save.originalUserId('883497737537265')
// data1.save
//   .createdAt(new Date())
//   .save.isAdmin(false)
//   .save.messages(['883497737537265', 'Hey I need help with uber!', '934879683479879', 'how so?'])

// // Set data OUT OF place with .set(). This is useful for setting different states for each component.
// const data2 = data1.set
//   .clickedComponent('button: rename confirm')
//   .set.current_page('settings')
//   .set.isAdmin(true)

// data1.data.isAdmin // false

// // compress it with .encode()
// const customId1 = data1.encode()
// const customId2 = data2.encode()

// console.log(customId2) // a string

// // decode received data

// const receivedState = new StringData(schema, customId2)
// console.log(receivedState.data)
// /*
// {
//   "originalUserId": "883497737537265",
//   "createdAt": "2023-12-15T03:45:13.000Z",
//   "current_page": "settings",
//   "clickedComponent": "button: rename confirm",
//   "messages": [
//     "883497737537265",
//     "Hey I need help with uber!",
//     "934879683479879",
//     "how so?"
//   ],
//   "isAdmin": true,
//   "counter": 0
// }
// */
