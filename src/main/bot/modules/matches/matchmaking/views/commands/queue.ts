import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../../discord-framework'
import { AppView, GuildCommand } from '../../../../../../app/ViewModule'
import { checkGuildInteraction } from '../../../../../ui-helpers/perms'
import {
  guildRankingsOption,
  withSelectedRanking,
} from '../../../../../ui-helpers/ranking-command-option'
import { escapeMd } from '../../../../../ui-helpers/strings'
import { findMatchFromQueue } from '../../queue/queue-matchmaking'
import { userJoinQueue } from '../../queue/queue-teams'

const optionnames = {
  ranking: 'ranking',
}

export const join_queue_cmd_config = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'join',
  description: `Join the matchmaking queue for a ranking`,
})

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
      withSelectedRanking(app, ctx, optionnames.ranking, {}, async p_ranking => {
        const interaction = checkGuildInteraction(ctx.interaction)
        const { guild, ranking, guild_ranking } = await app.db.guild_rankings.fetch({
          ranking_id: p_ranking.data.id,
          guild_id: interaction.guild_id,
        })

        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: { flags: D.MessageFlags.Ephemeral },
          },
          async ctx => {
            // const player = await getRegisterPlayer(app, interaction.member.user, ranking)

            const { rejoined } = await userJoinQueue(app, ranking, interaction.member.user)
            await ctx.followup({
              content:
                (rejoined ? `You are already in the queue` : 'You joined the queue') +
                ` for ${escapeMd(ranking.data.name)}`,
              flags: D.MessageFlags.Ephemeral,
            })

            await findMatchFromQueue(app, guild_ranking)
          },
        )
      }),
    ),
)

export const leave_queue_cmd_config = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'leave',
  description: `Leave all matchmaking queues you are in`,
})

export const leaveQueueCmd = new AppView(leave_queue_cmd_config, app =>
  leave_queue_cmd_config.onCommand(async ctx => {
    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: D.MessageFlags.Ephemeral },
      },
      async ctx => {
        const interaction = checkGuildInteraction(ctx.interaction)
        const user = app.db.users.get(interaction.member.user.id)
        const n_teams_removed = await user.removeFromQueues()
        await ctx.edit({
          content: n_teams_removed ? 'You left the queue' : `You're not in the queue`,
        })
      },
    )
  }),
)
