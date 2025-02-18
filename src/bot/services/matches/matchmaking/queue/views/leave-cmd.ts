import * as D from 'discord-api-types/v10'
import { CommandView } from '../../../../../../discord-framework'
import { AppView } from '../../../../ViewModule'

export const queue_cmd_config = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  name: 'leave',
  description: `Leave all queues you are in`,
})

export default new AppView(queue_cmd_config, app =>
  queue_cmd_config.onCommand(async ctx => {
    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: D.MessageFlags.Ephemeral },
      },
      async ctx => {
        const user = app.db.users.get(ctx.interaction.member.user.id)
        const n_players_left = await user.removePlayersFromQueue()
        await ctx.edit({
          content: n_players_left ? 'You left the queue' : `You're not in the queue`,
        })

        n_players_left &&
          (await ctx.send({
            content: `Someone has left the queue`,
          }))
      },
    )
  }),
)
