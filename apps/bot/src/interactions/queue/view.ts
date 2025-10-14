import { DeferredComponentContext, MessageData, ViewSignature, ViewState } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { userJoinQueue } from '../../services/matchmaking/queue/solo-queue'
import { Colors, escapeMd } from '../../services/utils/strings'
import { App } from '../../setup/app'

import { userJoinedQueueMessage } from '../../services/matchmaking/queue/message'

export const queue_view_sig = new ViewSignature({
  name: 'Queue Message',
  custom_id_prefix: 'q',
  state_schema: {
    clicked_btn: field.Choice({ join, leave }),
    ranking_id: field.Int(),
  },
  guild_only: true,
  experimental: false,
})

export const queue_view = queue_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    ctx.interaction.guild_id

    return ctx.defer(async ctx => {
      await ctx.state.get.clicked_btn()(app, ctx)
      // const { channel, message } = checkMessageComponentInteraction(ctx.interaction)
      // await app.discord.editMessage(channel.id, message.id, (await queueMessage(app, ctx.state)).patch_data)
    })
  },
})

export async function queueMessage(
  app: App,
  state: ViewState<typeof queue_view_sig.state_schema>,
): Promise<MessageData> {
  const ranking = await app.db.rankings.fetch(state.get.ranking_id())
  const props = app.rankings.getProperties(ranking)

  return new MessageData({
    embeds: [
      {
        title: `${escapeMd(ranking.data.name)} Queue`,
        description:
          `Join or leave the ${props.match_type_name}` + ` matchmaking queue for ${escapeMd(ranking.data.name)}`,
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
            custom_id: state.set.clicked_btn(join).cId(),
            label: 'Join',
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Secondary,
            custom_id: state.set.clicked_btn(leave).cId(),
            label: 'Leave',
          },
        ],
      },
    ],
  })
}

async function join(app: App, ctx: DeferredComponentContext<typeof queue_view_sig>) {
  const msg_id = ctx.interaction.message?.id

  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
  const { already_in } = await userJoinQueue(app, ctx.interaction.member.user.id, ctx.interaction.guild_id, ranking)
  await ctx.followup(
    userJoinedQueueMessage({
      app,
      already_in,
      ranking,
    }).response_data,
  )

  await ctx.edit((await queueMessage(app, ctx.state)).response_data, msg_id)
}

async function leave(app: App, ctx: DeferredComponentContext<typeof queue_view_sig>) {
  const msg_id = ctx.interaction.message?.id

  const user = app.db.users.get(ctx.interaction.member.user.id)
  const n_players_left = await user.removePlayersFromQueue()
  await ctx.followup({
    content: n_players_left ? 'You left the queue' : `You're not in the queue`,
    flags: D.MessageFlags.Ephemeral,
  })

  await ctx.edit((await queueMessage(app, ctx.state)).response_data, msg_id)
}
