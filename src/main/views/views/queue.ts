import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import { nonNullable } from '../../../utils/utils'

import {
  ChoiceField,
  MessageCreateContext,
  MessageData,
  MessageView,
  IntField,
} from '../../../discord-framework'

import { App } from '../../../main/app/app'
import { AppErrors } from '../../../main/app/errors'

import { onJoinQueue, onLeaveQueue } from '../../modules/matches/queue'

import { checkGuildInteraction } from '../utils/checks'

const queue_message_def = new MessageView({
  custom_id_prefix: 'q',
  state_schema: {
    component: new ChoiceField({ join: null, leave: null }),
    ranking_id: new IntField(),
  },
  param: (_: { ranking_id: number }) => void 0,
})

export default (app: App) =>
  queue_message_def
    .onInit(async (ctx) => {
      ctx.state.save.ranking_id(ctx.ranking_id)
      return queueMessage(ctx)
    })
    .onComponent(async (ctx) => {
      const interaction = checkGuildInteraction(ctx.interaction)
      const ranking_id = nonNullable(ctx.state.data.ranking_id, 'ranking_id')

      if (ctx.state.is.component('join')) {
        return ctx.defer(
          {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: 'Joined Queue',
              flags: MessageFlags.Ephemeral,
            },
          },
          async (ctx) => {
            await onJoinQueue(app, ranking_id, interaction.member.user)
            return ctx.ignore()
          },
        )
      } else if (ctx.state.is.component('leave')) {
        return ctx.defer(
          {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: 'Left queue',
              flags: MessageFlags.Ephemeral,
            },
          },
          async (ctx) => {
            await onLeaveQueue(app, ranking_id, interaction.member.user)
            return ctx.ignore()
          },
        )
      } else {
        throw new AppErrors.UnknownState(ctx.state.data.component)
      }
    })

export function queueMessage(ctx: MessageCreateContext<typeof queue_message_def>) {
  return new MessageData({
    content: '',
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Primary,
            custom_id: ctx.state.set.component('join').encode(),
            label: 'Join Queue',
          },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            custom_id: ctx.state.set.component('leave').encode(),
            label: 'Leave Queue',
          },
        ],
      },
    ],
  })
}
