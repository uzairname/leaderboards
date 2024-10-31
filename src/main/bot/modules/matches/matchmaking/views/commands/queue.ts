import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../../discord-framework'
import { AppView, GuildCommand } from '../../../../../../app/ViewModule'
import { checkGuildInteraction } from '../../../../../ui-helpers/perms'
import {
  guildRankingsOption,
  withSelectedRanking,
} from '../../../../../ui-helpers/ranking-command-option'
import { escapeMd } from '../../../../../ui-helpers/strings'
import { getOrCreatePlayer } from '../../../../players/manage-players'
import { ensureNoActiveMatches, ensurePlayersEnabled } from '../../../management/match-creation'
import { findMatchFromQueue } from '../../queue/queue-matchmaking'
import { userJoinQueue, userLeaveAllQueues } from '../../queue/queue-teams'

export const join_queue_cmd_config = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'join',
  description: `Join the matchmaking queue for a ranking`,
})

const optionnames = {
  ranking: 'ranking',
}

export const joinQueueCmd = new GuildCommand(
  join_queue_cmd_config,
  async (app, guild) => {
    return new AppCommand({
      ...join_queue_cmd_config.config,
      options: await guildRankingsOption(app, guild, optionnames.ranking, {}),
    })
  },
  app =>
    join_queue_cmd_config.onCommand(async ctx =>
      withSelectedRanking(app, ctx, optionnames.ranking, {}, async ranking => {
        const interaction = checkGuildInteraction(ctx.interaction)

        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: { flags: D.MessageFlags.Ephemeral },
          },
          async ctx => {
            const player = await getOrCreatePlayer(app, interaction.member.user.id, ranking)
            await ensureNoActiveMatches(app, [player.data.id], ranking.data.id)
            await ensurePlayersEnabled(app, [player], ranking)

            const { rejoined } = await userJoinQueue(app, ranking.data.id, interaction.member.user)
            await ctx.followup({
              content:
                (rejoined ? `You are already in the queue` : 'You joined the queue') +
                ` for ${escapeMd(ranking.data.name)}`,
              flags: D.MessageFlags.Ephemeral,
            })

            await findMatchFromQueue(app, ranking, interaction.guild_id)
          },
        )
      }),
    ),
)

export const leave_queue_cmd_config = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'leave',
  description: `Leave all queues matchmaking queues you are in`,
})

export const leaveQueueCmd = new AppView(leave_queue_cmd_config, app =>
  leave_queue_cmd_config.onCommand(async ctx => {
    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: {
          flags: D.MessageFlags.Ephemeral,
        },
      },
      async ctx => {
        const interaction = checkGuildInteraction(ctx.interaction)
        const n_teams_removed = await userLeaveAllQueues(app, interaction.member.user.id)
        await ctx.edit({
          content: n_teams_removed ? 'You left the queue' : `You're not in the queue`,
        })
      },
    )
  }),
)
