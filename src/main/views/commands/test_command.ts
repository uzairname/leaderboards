import * as D from 'discord-api-types/v10'
import {
  CommandContext,
  CommandView,
  ComponentContext,
  StringData,
  _,
  field,
} from '../../../discord-framework'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'
import { rankings_cmd_def } from './rankings/rankings'

// const user_command = new CommandView({
//   type: ApplicationCommandType.Message,
//   custom_id_prefix: 'user',

//   command: {
//     name: 'user',
//   },

//   state_schema: {}
// }).onCommand(async (ctx) => {

//   ctx.defer({
//     type: InteractionResponseType.DeferredChannelMessageWithSource
//   }, async (ctx) => {
//     ctx.interaction.data.resolved.messages
//   })

//   throw new Error('not implemented')
// })

const test_command = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  name: 'test',
  description: 'Test command',
  options: [
    {
      type: D.ApplicationCommandOptionType.Boolean,
      name: 'ephemeral',
      description: 'Whether the message is ephemeral',
    },
    {
      type: D.ApplicationCommandOptionType.User,
      name: 'user',
      description: 'The user to test',
    },
  ],
  custom_id_id: 'test',
  state_schema: {
    clicked_btn: field.Choice({ wait: _, increment: _, one: _, two: _ }),
    counter: field.Int(),
    original_user: field.String(),
    value: field.List(field.String()),
  },
})

export default (app: App) =>
  test_command
    .onCommand(async ctx => {
      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: D.MessageFlags.Ephemeral },
        },
        async ctx => {
          await new Promise(resolve => setTimeout(resolve, 1200))
          await ctx.edit({
            content: 'test',
          })
        },
      )

      const user_id = ctx.interaction.member?.user.id ?? ctx.interaction.user?.id
      ctx.state.save.original_user(user_id)
      ctx.state.save.counter(0)
      ctx.state.save.value(new Array(2).fill('0'))

      const ephemeral =
        (
          ctx.interaction.data.options?.find(o => o.name === 'ephemeral') as
            | D.APIApplicationCommandInteractionDataBooleanOption
            | undefined
        )?.value ?? true

      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: testMessageData(ctx, ephemeral),
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
            data: {
              content: `waiting`,
              flags: D.MessageFlags.Ephemeral,
            },
            type: D.InteractionResponseType.ChannelMessageWithSource,
          },
          async ctx => {
            const seconds = ctx.state.data.counter ?? 0

            await new Promise(resolve => setTimeout(resolve, seconds * 1000))
            await ctx.followup({
              content: `waited ${seconds} seconds.`,
              flags: D.MessageFlags.Ephemeral,
            })
          },
        )
      } else if (ctx.state.is.clicked_btn('increment')) {
        ctx.state.save.counter((ctx.state.data.counter ?? 0) + 1)

        return { type: D.InteractionResponseType.UpdateMessage, data: testMessageData(ctx) }
      } else if (ctx.state.is.clicked_btn('one')) {
        const current_value = ctx.state.get('value')

        current_value[0] += '1'
        ctx.state.save.value(current_value)
        return {
          type: D.InteractionResponseType.UpdateMessage,
          data: testMessageData(ctx),
        }
      } else if (ctx.state.is.clicked_btn('two')) {
        const current_value = ctx.state.get('value')

        current_value[1] += '2'
        ctx.state.save.value(current_value)
        return {
          type: D.InteractionResponseType.UpdateMessage,
          data: testMessageData(ctx),
        }
      } else {
        throw new AppErrors.UnknownState(ctx.state.data.clicked_btn)
      }
    })

function testMessageData(
  ctx: CommandContext<typeof test_command> | ComponentContext<typeof test_command>,
  ephemeral = false,
): D.APIInteractionResponseCallbackData {
  // `\ncommand context ${test_command.isCommandContext(ctx)}. component context: ${test_command.isComponentContext(ctx)}. ${test_command.isContextForView(ctx)}. ${test_command.isChatInteractionContext(ctx)}`

  return {
    content:
      `Value: ${ctx.state.data.value?.join(', ')}\nCounter: ${ctx.state.data.counter}` +
      `\n${ctx.state.data.clicked_btn}`,
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
            label: 'Two',
            custom_id: ctx.state.set.clicked_btn('two').cId(),
            style: D.ButtonStyle.Primary,
          },
        ],
      },
    ],
    flags: ephemeral ? D.MessageFlags.Ephemeral : undefined,
  }
}

const schema = {
  originalUserId: field.String(),
  createdAt: field.Date(),
  current_page: field.Choice({
    settings: null,
    main: null,
    chat: null,
  }),
  clickedComponent: field.Choice({
    'button: add user': null,
    'button: delete': null,
    'modal: rename': null,
    'button: rename confirm': null,
  }),
  messages: field.List(field.String()),
  isAdmin: field.Bool(),
  counter: field.Int(0),
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
