import * as D from 'discord-api-types/v10'
import {
  $type,
  MessageCreateContext,
  MessageData,
  MessageView,
  _,
  field,
} from '../../../discord-framework'
import { nonNullable } from '../../../utils/utils'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'
import { onJoinQueue, onLeaveQueue } from '../../modules/matches/queue'
import { checkGuildInteraction } from '../utils/checks'

const queue_message_def = new MessageView({
  custom_id_id: 'q',
  state_schema: {
    component: field.Choice({ join: _, leave: _ }),
    ranking_id: field.Int(),
  },
})

export default (app: App) =>
  queue_message_def.onComponent(async ctx => {
    const interaction = checkGuildInteraction(ctx.interaction)
    const ranking_id = ctx.state.get('ranking_id')

    if (ctx.state.is.component('join')) {
      return ctx.defer(
        {
          type: D.InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: 'Joined Queue',
            flags: D.MessageFlags.Ephemeral,
          },
        },
        async ctx => {
          await onJoinQueue(app, ranking_id, interaction.member.user)
        },
      )
    } else if (ctx.state.is.component('leave')) {
      return ctx.defer(
        {
          type: D.InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: 'Left queue',
            flags: D.MessageFlags.Ephemeral,
          },
        },
        async ctx => {
          await onLeaveQueue(app, ranking_id, interaction.member.user)
        },
      )
    } else {
      throw new AppErrors.UnknownState(ctx.state.data.component)
    }
  })

export async function queueMessage(ranking_id: number): Promise<MessageData> {
  const state = queue_message_def.getState({ ranking_id })
  return new MessageData({
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Primary,
            custom_id: state.set.component('join').cId(),
            label: 'Join Queue',
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Secondary,
            custom_id: state.set.component('leave').cId(),
            label: 'Leave Queue',
          },
        ],
      },
    ],
  })
}
