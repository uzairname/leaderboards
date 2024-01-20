import * as D from 'discord-api-types/v10'
import {
  $type,
  InteractionContext,
  MessageCreateContext,
  MessageData,
  MessageView,
  _,
  field,
} from '../../../discord-framework'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'
import { Colors, relativeTimestamp } from '../../messages/message_pieces'
import { onJoinQueue, onLeaveQueue } from '../../modules/matches/matchmaking/queue'
import { checkGuildInteraction } from '../utils/checks'

const queue_message_def = new MessageView({
  custom_id_prefix: 'q',
  state_schema: {
    component: field.Enum({ join: _, leave: _ }),
    ranking_id: field.Int(),
    last_active: field.Date(),
  },
})

export const queueView = (app: App) =>
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
          ctx.state.save.last_active(new Date())
          await app.bot.editMessage(
            interaction.channel!.id,
            interaction.message!.id,
            (await queueMessage(app, ranking_id, ctx)).patchdata,
          )
        },
      )
    } else if (ctx.state.data.component == 'leave') {
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

export async function queueMessage(
  app: App,
  ranking_id: number,
  ctx?: InteractionContext<typeof queue_message_def>,
): Promise<MessageData> {
  const state = ctx?.state ?? queue_message_def.newState({ ranking_id })
  const ranking = await app.db.rankings.get(ranking_id)
  return new MessageData({
    embeds: [
      {
        title: `${ranking.data.name} Queue`,
        description: `Join or leave the matchmaking queue for ${ranking.data.name} here`
          + `\nLast active: ${state.data.last_active ? relativeTimestamp(state.data.last_active) : `never`}`, //prettier-ignore
        color: Colors.EmbedBackground,
      },
    ],
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Primary,
            custom_id: state.set.component('join').cId(),
            label: 'Join',
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Secondary,
            custom_id: state.set.component('leave').cId(),
            label: 'Leave',
          },
        ],
      },
    ],
  })
}
