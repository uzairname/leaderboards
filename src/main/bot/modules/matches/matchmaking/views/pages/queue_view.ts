import * as D from 'discord-api-types/v10'
import {
  InteractionContext,
  MessageData,
  MessageView,
  _,
  field,
} from '../../../../../../../discord-framework'
import { App } from '../../../../../../context/app_context'
import { Colors } from '../../../../../common/constants'
import { escapeMd, relativeTimestamp } from '../../../../../common/strings'
import { checkGuildInteraction } from '../../../../../utils/perms'
import { AppView } from '../../../../../utils/ViewModule'
import { userJoinQueue, userLeaveQueue } from '../../queue/queue_join_leave'

const queue_message_def = new MessageView({
  custom_id_prefix: 'q',
  state_schema: {
    component: field.Enum({ join: _, leave: _ }),
    ranking_id: field.Int(),
    last_active: field.Date(),
  },
})

export default new AppView((app: App) =>
  queue_message_def.onComponent(async ctx => {
    const interaction = checkGuildInteraction(ctx.interaction)
    const ranking_id = ctx.state.get.ranking_id()

    if (ctx.state.is.component('join')) {
      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: D.MessageFlags.Ephemeral },
        },
        async ctx => {
          await userJoinQueue(app, ranking_id, interaction.member.user)
          ctx.state.save.last_active(new Date())

          await Promise.all([
            app.bot.editMessage(
              interaction.channel!.id,
              interaction.message!.id,
              (await queueMessage(app, ranking_id, ctx)).as_patch,
            ),
            ctx.edit({
              content: 'You joined the queue',
            }),
          ])
        },
      )
    } else if (ctx.state.data.component == 'leave') {
      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: {
            flags: D.MessageFlags.Ephemeral,
          },
        },
        async ctx => {
          const teams_removed = await userLeaveQueue(app, ranking_id, interaction.member.user)
          await ctx.edit({
            content: teams_removed ? 'You left the queue' : `You're not in the queue`,
          })
        },
      )
    } else {
      throw new Error(`Unknown state ${ctx.state.data.component}`)
    }
  }),
)

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
        title: `${escapeMd(ranking.data.name)} Queue`,
        description: 
          `Join or leave the ${new Array(ranking.data.num_teams).fill(ranking.data.players_per_team).join('v')}`
            + ` matchmaking queue for ${ranking.data.name}`
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
