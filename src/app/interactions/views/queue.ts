import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import {
  ChatInteractionResponse,
  ChoiceField,
  ComponentContext,
  MessageCreateContext,
  MessageData,
  MessageView,
  StringField,
} from '../../../discord-framework'

import { assertValue } from '../../../utils/utils'

import { App } from '../../app'
import { Errors } from '../../errors'

import { onJoinQueue, onLeaveQueue } from '../../modules/queue'

import { checkGuildInteraction } from '../checks'

const queue_message_def = new MessageView({
  custom_id_prefix: 'q',
  state_schema: {
    component: new ChoiceField({
      join: null,
      leave: null,
    }),
    ranking_id: new StringField(),
  },
  args: (_: { ranking_id: number }) => null,
})

export default (app: App) =>
  queue_message_def
    .onInit(async (ctx, args) => {
      ctx.state.save.ranking_id(args.ranking_id.toString())
      return queueMessage(ctx)
    })
    .onComponent(async (ctx) => {
      const interaction = checkGuildInteraction(ctx.interaction)
      assertValue(ctx.state.data.ranking_id)

      if (ctx.state.is.component('join')) {
        ctx.offload(async (ctx) => {
          ctx.send({
            content: 'Joined queue',
            flags: MessageFlags.Ephemeral,
          })
        })
        const result = await onJoinQueue(app, parseInt(ctx.state.data.ranking_id), interaction.member.user)

      } else if (ctx.state.is.component('leave')) {
        ctx.offload(async (ctx) => {
          ctx.send({
            content: 'Left queue',
            flags: MessageFlags.Ephemeral,
          })
        })
        await onLeaveQueue(app, parseInt(ctx.state.data.ranking_id), interaction.member.user)
      } else {
        throw new Errors.UnknownState(ctx.state.data.component)
      }
    })

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
