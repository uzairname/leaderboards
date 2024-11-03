import * as D from 'discord-api-types/v10'
import { PartialRanking } from '../../../../../../../database/models/rankings'
import {
  MessageData,
  MessageView,
  StateContext,
  _,
  field,
} from '../../../../../../../discord-framework'
import { App } from '../../../../../../app/App'
import { AppView } from '../../../../../../app/ViewModule'
import { Colors } from '../../../../../ui-helpers/constants'
import { checkGuildComponentInteraction } from '../../../../../ui-helpers/perms'
import { escapeMd, relativeTimestamp } from '../../../../../ui-helpers/strings'
import { userLeaveQueue, userJoinQueue } from '../../queue/queue-teams'

const queue_page_config = new MessageView({
  name: 'Queue Message',
  custom_id_prefix: 'q',
  state_schema: {
    clicked: field.Enum({
      join: _,
      leave: _,
    }),
    ranking_id: field.Int(),
    last_active: field.Date(),
  },
})

export default new AppView(queue_page_config, app =>
  queue_page_config.onComponent(async ctx => {
    const interaction = checkGuildComponentInteraction(ctx.interaction)
    const ranking = app.db.rankings.get(ctx.state.get.ranking_id())

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: D.MessageFlags.Ephemeral },
      },
      async ctx => {
        if (ctx.state.is.clicked('join')) {
          await userJoinQueue(app, ranking, interaction.member.user)
          ctx.state.set.last_active(new Date())
          await ctx.edit({
            content: 'You joined the queue',
          })
        } else if (ctx.state.is.clicked('leave')) {
          const n_teams_removed = await userLeaveQueue(app, ranking, interaction.member.user)
          await ctx.edit({
            content: n_teams_removed ? 'You left the queue' : `You're not in the queue`,
          })
        }
        app.discord.editMessage(
          interaction.channel.id,
          interaction.message.id,
          (await _queueMessage(app, ctx)).as_patch,
        )
      },
    )
  }),
)

export async function queueMessage(app: App, ranking: PartialRanking) {
  return _queueMessage(app, { state: queue_page_config.newState({ ranking_id: ranking.data.id }) })
}

async function _queueMessage(
  app: App,
  ctx: StateContext<typeof queue_page_config>,
): Promise<MessageData> {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

  return new MessageData({
    embeds: [
      {
        title: `${escapeMd(ranking.data.name)} Queue`,
        description:
          `Join or leave the ${new Array(ranking.data.teams_per_match).fill(ranking.data.players_per_team).join('v')}` +
          ` matchmaking queue for ${escapeMd(ranking.data.name)}` +
          `\nLast active: ${ctx.state.data.last_active ? relativeTimestamp(ctx.state.data.last_active) : `never`}`,
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
            custom_id: ctx.state.set.clicked('join').cId(),
            label: 'Join',
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Secondary,
            custom_id: ctx.state.set.clicked('leave').cId(),
            label: 'Leave',
          },
        ],
      },
    ],
  })
}
