import * as D from 'discord-api-types/v10'
import { time } from 'drizzle-orm/mysql-core'
import { CommandView } from '../../../discord-framework'
import { App } from '../../app/app'
import { getOrAddGuild } from '../../modules/guilds'
import { syncMatchSummaryChannel } from '../../modules/matches/match_summary'
import { syncGuildRankingChannelsMessages } from '../../modules/rankings/ranking_channels'
import { ensureAdminPerms } from '../utils/checks'
import { checkGuildInteraction } from '../utils/checks'

export const restore_cmd = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  state_schema: {},
  command: {
    name: 'restore',
    description: 'Restores all channels and messages managed by this bot'
  },
  custom_id_prefix: 'r'
})

export const restoreCmd = (app: App) =>
  restore_cmd.onCommand(async ctx => {
    return ctx.defer(
      {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `Restoring channels and messages...`,
          flags: D.MessageFlags.Ephemeral
        }
      },
      async ctx => {
        const interaction = checkGuildInteraction(ctx.interaction)
        await ensureAdminPerms(app, ctx)
        const guild_rankings = await app.db.guild_rankings.get({ guild_id: interaction.guild_id })

        for (const item of guild_rankings) {
          await syncGuildRankingChannelsMessages(app, item.guild_ranking)
          await syncMatchSummaryChannel(app, item.guild_ranking)
        }

        // await Promise.race([
        //   new Promise<void>(async (resolve) => {
        //     for (const item of guild_rankings) {
        //       await Promise.all([
        //         syncGuildRankingChannelsMessages(app, item.guild_ranking),
        //         syncMatchSummaryChannel(app, item.guild_ranking),
        //       ])
        //     }
        //     resolve()
        //   }),
        //   new Promise<void>((resolve) =>
        //     setTimeout(async () => {
        //       await ctx.editOriginal({
        //         content: `Timed out. Please try one at a time.`,
        //         flags: MessageFlags.Ephemeral,
        //       })
        //       resolve()
        //     }, 8000),
        //   ),
        // ])

        return await ctx.edit({
          content: `done`,
          flags: D.MessageFlags.Ephemeral
        })
      }
    )
  })
