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
} from '../../../discord/interactions/utils/string_data'
import { CommandContext, CommandView, ComponentContext } from '../../../discord/interactions/views'
import { App } from '../../app'
import { AppErrors, Errors } from '../../errors'

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
    ],
  },

  state_schema: {
    clicked_btn: new ChoiceField({ wait: null, increment: null }),
    counter: new NumberField(),
    original_user: new StringField(),
  },
})

export default (app: App) =>
  test_command
    .onCommand(async (ctx) => {
      const user_id = ctx.interaction.member?.user.id ?? ctx.interaction.user?.id
      ctx.state.save.original_user(user_id)
      ctx.state.save.counter(0)
      app

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
        throw new AppErrors.NotComponentOwner(ctx.state.data.original_user)
      }

      if (ctx.state.is.clicked_btn('wait')) {
        ctx.offload(async (ctx) => {
          const seconds = ctx.state.data.counter ?? 0

          await ctx.sendMessage({
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
      } else {
        throw new Errors.UnknownState(ctx.state.data.clicked_btn)
      }
    })

function testMessageData(
  ctx: CommandContext<typeof test_command> | ComponentContext<typeof test_command>,
  ephemeral = false,
): APIInteractionResponseCallbackData {
  return {
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
        ],
      },
    ],
    flags: ephemeral ? MessageFlags.Ephemeral : undefined,
  }
}
