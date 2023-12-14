import {
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import { CommandView } from '../../../discord-framework'

import { App } from '../../../main/app/app'

import { syncGuildRankingChannelsMessages } from '../../modules/rankings/ranking_channels'
import { getOrAddGuild } from '../../../main/modules/guilds'

import { ensureAdminPerms } from '../utils/checks'
import { checkGuildInteraction } from '../utils/checks'
import { syncMatchSummaryChannel } from '../../modules/matches/match_summary'
import { time } from 'drizzle-orm/mysql-core'

export const restore_cmd_def = new CommandView({
  type: ApplicationCommandType.ChatInput,
  state_schema: {},
  command: {
    name: 'restore',
    description: 'Restores all channels and messages managed by this bot',
  },
  custom_id_prefix: 'r',
})

export default (app: App) =>
  restore_cmd_def.onCommand(async (ctx) => {
    return ctx.defer(
      {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `Restoring channels and messages...`,
          flags: MessageFlags.Ephemeral,
        },
      },
      async (ctx) => {
        const interaction = checkGuildInteraction(ctx.interaction)
        const guild = await getOrAddGuild(app, interaction.guild_id)
        await ensureAdminPerms(app, ctx, guild)
        const guild_rankings = await guild.guildRankings()

        await Promise.race([
          new Promise(async () => {
            for (const item of guild_rankings) {
              await Promise.all([syncGuildRankingChannelsMessages(app, item.guild_ranking)])
            }
          }),
          new Promise((resolve) =>
            setTimeout(async () => {
              await ctx.editOriginal({
                content: `Timed out. Please try one at a time.`,
                flags: MessageFlags.Ephemeral,
              })
            }, 8000),
          ),
        ])

        return await ctx.editOriginal({
          content: `done`,
          flags: MessageFlags.Ephemeral,
        })
      },
    )
  })
