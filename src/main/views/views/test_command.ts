import {
  APIApplicationCommandInteractionDataBooleanOption,
  APIInteractionResponseCallbackData,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import {
  ChoiceField,
  IntField,
  StringField,
  CommandContext,
  CommandView,
  ComponentContext,
  ListField,
  StringData,
  TimestampField,
  BooleanField,
} from '../../../discord-framework'
import { App } from '../../../main/app/app'

import help from './help'
import { nonNullable } from '../../../utils/utils'
import { AppErrors, UserErrors } from '../../../main/app/errors'
import {
  ViewState,
  getMessageViewMessageData,
} from '../../../discord-framework/interactions/view_helpers'
import { rankings_command_def } from './rankings'
import { sentry } from '../../../request/sentry'

const test_command = new CommandView({
  type: ApplicationCommandType.ChatInput,

  custom_id_prefix: 'test',

  command: {
    name: 'test',
    description: 'Test command',
    options: [
      {
        type: ApplicationCommandOptionType.Boolean,
        name: 'ephemeral',
        description: 'Whether the message is ephemeral',
      },
      {
        type: ApplicationCommandOptionType.User,
        name: 'user',
        description: 'The user to test',
      },
    ],
  },

  state_schema: {
    clicked_btn: new ChoiceField({ wait: null, increment: null, one: null, two: null }),
    counter: new IntField(),
    original_user: new StringField(),
    value: new ListField(),
  },
})

export default (app: App) =>
  test_command
    .onCommand(async (ctx) => {
      const user_id = ctx.interaction.member?.user.id ?? ctx.interaction.user?.id
      ctx.state.save.original_user(user_id)
      ctx.state.save.counter(0)
      ctx.state.save.value(new Array(2).fill('0'))

      const ephemeral =
        (
          ctx.interaction.data.options?.find((o) => o.name === 'ephemeral') as
            | APIApplicationCommandInteractionDataBooleanOption
            | undefined
        )?.value ?? true

      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: testMessageData(ctx, ephemeral),
      }
    })
    .onComponent(async (ctx) => {
      const user_id = ctx.interaction.member?.user.id ?? ctx.interaction.user?.id

      if (ctx.state.data.original_user !== user_id) {
        throw new UserErrors.NotComponentOwner(ctx.state.data.original_user)
      }

      if (ctx.state.is.clicked_btn('wait')) {
        return ctx.defer(
          {
            data: {
              content: `waiting`,
              flags: MessageFlags.Ephemeral,
            },
            type: InteractionResponseType.ChannelMessageWithSource,
          },
          async (ctx) => {
            const seconds = ctx.state.data.counter ?? 0

            await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
            return ctx.followup({
              content: `waited ${seconds} seconds`,
              flags: MessageFlags.Ephemeral,
            })
          },
        )
      } else if (ctx.state.is.clicked_btn('increment')) {
        ctx.state.save.counter((ctx.state.data.counter ?? 0) + 1)

        return { type: InteractionResponseType.UpdateMessage, data: testMessageData(ctx) }
      } else if (ctx.state.is.clicked_btn('one')) {
        const current_value = nonNullable(ctx.state.data.value, 'value')

        current_value[0] += '1'
        ctx.state.save.value(current_value)
        return {
          type: InteractionResponseType.UpdateMessage,
          data: testMessageData(ctx),
        }
      } else if (ctx.state.is.clicked_btn('two')) {
        const current_value = nonNullable(ctx.state.data.value, 'value')

        current_value[1] += '2'
        ctx.state.save.value(current_value)
        return {
          type: InteractionResponseType.UpdateMessage,
          data: testMessageData(ctx),
        }
      } else {
        throw new AppErrors.UnknownState(ctx.state.data.clicked_btn)
      }
    })

function testMessageData(
  ctx: CommandContext<typeof test_command> | ComponentContext<typeof test_command>,
  ephemeral = false,
): APIInteractionResponseCallbackData {
  sentry.debug(`encoded ${ViewState.create(rankings_command_def).encode()}`)

  return {
    content: `Value: ${ctx.state.data.value?.join(', ')}\nCounter: ${ctx.state.data.counter}`,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            label: `Wait ${ctx.state.data.counter} seconds`,
            custom_id: ctx.state.set.clicked_btn('wait').encode(),
            style: ButtonStyle.Primary,
          },
          {
            type: ComponentType.Button,
            label: 'Increment',
            custom_id: ctx.state.set.clicked_btn('increment').encode(),
            style: ButtonStyle.Primary,
          },
          {
            type: ComponentType.Button,
            label: 'rankings',
            custom_id: ViewState.create(rankings_command_def)
              .cId({
                component: 'btn:rename',
                owner_id: ctx.state.data.original_user,
                page: 'ranking settings',
                selected_ranking_id: 5,
              }),
            style: ButtonStyle.Primary,
          },
          {
            type: ComponentType.Button,
            label: 'Two',
            custom_id: ctx.state.set.clicked_btn('two').encode(),
            style: ButtonStyle.Primary,
          },
        ],
      },
    ],
    flags: ephemeral ? MessageFlags.Ephemeral : undefined,
  }
}

const schema = {
  originalUserId: new StringField(),
  createdAt: new TimestampField(),
  current_page: new ChoiceField({
    settings: null,
    main: null,
    chat: null,
  }),
  clickedComponent: new ChoiceField({
    'button: add user': null,
    'button: delete': null,
    'modal: rename': null,
    'button: rename confirm': null,
  }),
  messages: new ListField(),
  isAdmin: new BooleanField(),
  counter: new IntField(0),
}

// encode data

const data1 = new StringData(schema)

// Everything is type-safe

// Save data, IN place with .save
data1.save.originalUserId('883497737537265')
data1.save
  .createdAt(new Date())
  .save.isAdmin(false)
  .save.messages(['883497737537265', 'Hey I need help with uber!', '934879683479879', 'how so?'])

// Set data OUT OF place with .set(). This is useful for setting different states for each component.
const data2 = data1.set
  .clickedComponent('button: rename confirm')
  .set.current_page('settings')
  .set.isAdmin(true)

data1.data.isAdmin // false

// compress it with .encode()
const customId1 = data1.encode()
const customId2 = data2.encode()

console.log(customId2) // a string

// decode received data

const receivedState = new StringData(schema, customId2)
console.log(receivedState.data)
/*
{
  "originalUserId": "883497737537265",
  "createdAt": "2023-12-15T03:45:13.000Z",
  "current_page": "settings",
  "clickedComponent": "button: rename confirm",
  "messages": [
    "883497737537265",
    "Hey I need help with uber!",
    "934879683479879",
    "how so?"
  ],
  "isAdmin": true,
  "counter": 0
} 
*/
