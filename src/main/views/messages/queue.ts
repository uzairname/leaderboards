import * as D from 'discord-api-types/v10'
import {
  $type,
  ChoiceField,
  IntField,
  MessageCreateContext,
  MessageData,
  MessageView,
  _
} from '../../../discord-framework'
import { nonNullable } from '../../../utils/utils'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'
import { onJoinQueue, onLeaveQueue } from '../../modules/matches/queue'
import { checkGuildInteraction } from '../utils/checks'

const queue_message_def = new MessageView({
  custom_id_prefix: 'q',
  state_schema: {
    component: new ChoiceField({ join: _, leave: _ }),
    ranking_id: new IntField()
  },
  param: $type<{ ranking_id: number }>
})

export default (app: App) =>
  queue_message_def
    .onInit(async ctx => {
      ctx.state.save.ranking_id(ctx.ranking_id)
      return queueMessage(ctx)
    })
    .onComponent(async ctx => {
      const interaction = checkGuildInteraction(ctx.interaction)
      const ranking_id = ctx.state.get('ranking_id')

      if (ctx.state.is.component('join')) {
        return ctx.defer(
          {
            type: D.InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: 'Joined Queue',
              flags: D.MessageFlags.Ephemeral
            }
          },
          async ctx => {
            await onJoinQueue(app, ranking_id, interaction.member.user)
          }
        )
      } else if (ctx.state.is.component('leave')) {
        return ctx.defer(
          {
            type: D.InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: 'Left queue',
              flags: D.MessageFlags.Ephemeral
            }
          },
          async ctx => {
            await onLeaveQueue(app, ranking_id, interaction.member.user)
          }
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
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Primary,
            custom_id: ctx.state.set.component('join').encode(),
            label: 'Join Queue'
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Secondary,
            custom_id: ctx.state.set.component('leave').encode(),
            label: 'Leave Queue'
          }
        ]
      }
    ]
  })
}
