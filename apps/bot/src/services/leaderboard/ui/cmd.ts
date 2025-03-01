import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { guildRankingsOption, withSelectedRanking } from '../../../utils/ui/view-helpers/ranking-option'
import { leaderboardPage } from './pages'
import { leaderboard_view_sig } from './view'
import { PartialGuild } from '@repo/db/models'

const leaderboard_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'lb',
  description: 'View the leaderboard for a ranking',
})

export const leaderboard_cmd = leaderboard_cmd_sig.set<App>({
  /**
   * Only enable in guilds with a ranking, and include the ranking option 
   * only if the guild has more than one ranking.
   */
  guildSignature: async (app, guild_id) => {
    const guild_rankings = await app.db.guild_rankings.fetchBy({ guild_id })
    if (guild_rankings.length == 0) return null
    return new CommandSignature({
      ...leaderboard_cmd_sig.config,
      options: await guildRankingsOption(app, app.db.guilds.get(guild_id))
    })
  },
  onCommand: async (ctx, app) =>
    withSelectedRanking(
      {
        app,
        ctx,
        ranking_id: getOptions(ctx.interaction, {
          ranking: { type: D.ApplicationCommandOptionType.Integer },
        }).ranking,
      },
      async ranking => {
        const state = leaderboard_view_sig.newState({
          ranking_id: ranking.data.id,
          page: 1,
        })
        return ctx.defer(async ctx => {
          const message_data = await leaderboardPage(app, { ...ctx, state })
          await ctx.edit(message_data)
        })
      },
    ),
})

export async function lbCmdMention(
  app: App,
  guild?: PartialGuild
) {




}