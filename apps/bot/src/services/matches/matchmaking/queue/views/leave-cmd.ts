import { CommandSignature } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../../setup/app'
import { isQueueEnabled } from '../../../../rankings/ranking-properties'

export const leave_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'leave',
  description: `Leave all queues you are in`,
})

export const leave_cmd = leave_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    const guild_rankings = await app.db.guild_rankings.getBy({ guild_id: guild.data.id })
    const queue_enabled_rankings = guild_rankings.filter(r => isQueueEnabled(r.guild_ranking))

    if (queue_enabled_rankings.length == 0) return null
    return leave_cmd_sig
  },
  onCommand: async (ctx, app) => {
    return ctx.defer(async ctx => {
        await app.db.users.get(ctx.interaction.member.user.id).removePlayersFromQueue()
        await ctx.edit({
          content: 'You left the queue',
        })
      },
    )
  },
})
