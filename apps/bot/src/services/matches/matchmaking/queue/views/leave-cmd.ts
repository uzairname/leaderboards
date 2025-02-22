import { CommandView } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { AppView, GuildCommand } from '../../../../../classes/ViewModule'
import { isQueueEnabled } from '../../../../rankings/ranking-properties'

export const queue_cmd_config = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  name: 'leave',
  description: `Leave all queues you are in`,
})

export default new GuildCommand(queue_cmd_config, 
  async (app, guild) => {
    const guild_rankings = await app.db.guild_rankings.getBy({ guild_id: guild.data.id })
    const queue_enabled_rankings = guild_rankings.filter(r => isQueueEnabled(r.guild_ranking))

    if (queue_enabled_rankings.length == 0) return null
    return queue_cmd_config
  },
  app =>
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
