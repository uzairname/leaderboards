import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import { ChoiceField, StringField } from '../../../discord/interactions/utils/string_data'
import { assertNonNullable } from '../../../utils/utils'

import { MessageData } from '../../../discord'
import {
  ComponentContext,
  MessageCreateContext,
  MessageView,
} from '../../../discord/interactions/views'
import { ChatInteractionResponse } from '../../../discord/interactions/types'

import { App } from '../../app'
import { Errors } from '../../errors'

import { onJoinQueue, onLeaveQueue } from '../../modules/queue'

import { checkGuildInteraction } from '../../helpers/checks'

const queue_message_def = new MessageView({
  custom_id_prefix: 'q',
  state_schema: {
    component: new ChoiceField({
      join: null,
      leave: null,
    }),
    leaderboard_division_id: new StringField(),
  },
  args: (_: { division_id: number }) => null,
})

export default (app: App) =>
  queue_message_def
    .onSend(async (ctx, args) => {
      ctx.state.save.leaderboard_division_id(args.division_id.toString())
      return queueMessage(ctx)
    })
    .onComponent(async (ctx) => {
      return await handleQueueInteraction(app, ctx)
    })

async function handleQueueInteraction(
  app: App,
  ctx: ComponentContext<typeof queue_message_def>,
): Promise<ChatInteractionResponse> {
  const interaction = checkGuildInteraction(ctx.interaction)
  assertNonNullable(ctx.state.data.leaderboard_division_id)

  if (ctx.state.is.component('join')) {
    await onJoinQueue(
      app,
      parseInt(ctx.state.data.leaderboard_division_id),
      interaction.member.user,
    )

    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: 'Joined queue',
        flags: MessageFlags.Ephemeral,
      },
    }
  } else if (ctx.state.is.component('leave')) {
    await onLeaveQueue(
      app,
      parseInt(ctx.state.data.leaderboard_division_id),
      interaction.member.user,
    )

    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: 'Left queue',
        flags: MessageFlags.Ephemeral,
      },
    }
  } else {
    throw new Errors.UnknownState(ctx.state.data.component)
  }
}

export function queueMessage(ctx: MessageCreateContext<typeof queue_message_def>) {
  return new MessageData({
    content: 'Queue for leaderboard',
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Success,
            custom_id: ctx.state.set.component('join').encode(),
            label: 'Join',
          },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            custom_id: ctx.state.set.component('leave').encode(),
            label: 'Leave',
          },
        ],
      },
    ],
  })
}
