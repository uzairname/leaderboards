import { checkMessageComponentInteraction, DeferContext, MessageData, ViewSignature, ViewState } from '@repo/discord'
import { field } from '@repo/utils'
import { Colors } from 'apps/bot/src/utils/ui'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../../setup/app'
import { escapeMd, relativeTimestamp } from '../../../../../utils/ui'
import { userJoinQueue } from '../1v1-queue'

export const queue_view_sig = new ViewSignature({
  name: 'Queue Message',
  custom_id_prefix: 'q',
  state_schema: {
    handler: field.Choice({ join, leave }),
    ranking_id: field.Int(),
    last_active: field.Date(),
    type: field.Enum({
      on_user_join: null,
    }),
  },
  guild_only: true,
  experimental: true,
})

export const queue_view = queue_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    ctx.interaction.guild_id

    return ctx.defer(async ctx => {
        await ctx.state.get.handler()(app, ctx)
        const { channel, message } = checkMessageComponentInteraction(ctx.interaction)
        await app.discord.editMessage(channel.id, message.id, (await queueMessage(app, ctx.state.data)).as_patch)
      },
    )
  },
})

export async function queueMessage(
  app: App,
  data: ViewState<typeof queue_view_sig.state_schema>['data'],
): Promise<MessageData> {
  const state = queue_view_sig.newState(data)

  const ranking = await app.db.rankings.fetch(state.get.ranking_id())

  return new MessageData({
    embeds: [
      {
        title: `${escapeMd(ranking.data.name)} Queue`,
        description:
          `Join or leave the ${new Array(ranking.data.teams_per_match).fill(ranking.data.players_per_team).join('v')}` +
          ` matchmaking queue for ${escapeMd(ranking.data.name)}` +
          `\nLast active: ${state.data.last_active ? relativeTimestamp(state.data.last_active) : `never`}`,
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
            custom_id: state.set.handler(join).cId(),
            label: 'Join',
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Secondary,
            custom_id: state.set.handler(leave).cId(),
            label: 'Leave',
          },
        ],
      },
    ],
  })
}

async function join(app: App, ctx: DeferContext<typeof queue_view_sig>) {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
  const { already_in: rejoined } = await userJoinQueue(app, ctx, ranking)
  ctx.state.set.last_active(new Date())
  await ctx.edit({
    content:
      (rejoined ? `You are already in the queue` : 'You joined the queue') + ` for ${escapeMd(ranking.data.name)}`,
  })
}

async function leave(app: App, ctx: DeferContext<typeof queue_view_sig>) {
  const user = app.db.users.get(ctx.interaction.member.user.id)
  const n_players_left = await user.removePlayersFromQueue()
  await ctx.edit({
    content: n_players_left ? 'You left the queue' : `You're not in the queue`,
  })
}
