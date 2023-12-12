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
  NumberField,
  StringField,
  CommandContext,
  CommandView,
  ComponentContext,
  ListField,
} from '../../../discord-framework'
import { App } from '../../app'

import help from './help'
import { assertValue } from '../../../utils/utils'
import { UserErrors } from '../../errors'

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
    counter: new NumberField(),
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

      const last_deployed = (await app.db.settings.getOrUpdate()).data.last_deployed

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
        ctx.offload(async (ctx) => {
          const seconds = ctx.state.data.counter ?? 0

          await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
          ctx.followup({
            content: `waited ${seconds} seconds`,
            flags: MessageFlags.Ephemeral,
          })
        })

        return {
          data: {
            content: `waiting`,
            flags: MessageFlags.Ephemeral,
          },
          type: InteractionResponseType.ChannelMessageWithSource,
        }
      } else if (ctx.state.is.clicked_btn('increment')) {
        ctx.state.save.counter((ctx.state.data.counter ?? 0) + 1)

        return { type: InteractionResponseType.UpdateMessage, data: testMessageData(ctx) }
      } else if (ctx.state.is.clicked_btn('one')) {
        const current_value = ctx.state.data.value
        assertValue(current_value, 'value')

        current_value[0] += '1'
        ctx.state.save.value(current_value)
        return {
          type: InteractionResponseType.UpdateMessage,
          data: testMessageData(ctx),
        }
      } else if (ctx.state.is.clicked_btn('two')) {
        const current_value = ctx.state.data.value
        assertValue(current_value, 'value')

        current_value[1] += '2'
        ctx.state.save.value(current_value)
        return {
          type: InteractionResponseType.UpdateMessage,
          data: testMessageData(ctx),
        }
      } else {
        throw new UserErrors.UnknownState(ctx.state.data.clicked_btn)
      }
    })

function testMessageData(
  ctx: CommandContext<typeof test_command> | ComponentContext<typeof test_command>,
  ephemeral = false,
): APIInteractionResponseCallbackData {
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
            label: 'One',
            custom_id: ctx.state.set.clicked_btn('one').encode(),
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
