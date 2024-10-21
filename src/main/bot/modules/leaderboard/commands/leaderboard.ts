import * as D from 'discord-api-types/v10'
import { AppCommand, field } from '../../../../../discord-framework'
import { App } from '../../../../context/app_context'
import { AppView } from '../../../utils/view_module'
import { guildRankingsOption, withSelectedRanking } from '../../utils/ranking_command_option'
import { leaderboardMessage } from '../leaderboard_messages'

const optionnames = {
  ranking: 'ranking',
}

const leaderboard_cmd = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'lb',
  name: 'leaderboard',
  description: 'View the leaderboard for a ranking',

  state_schema: {
    page: field.Int(),
    ranking_id: field.Int(),
  },
})

const leaderboardCmdDef = async (app: App, guild_id: string) =>
  new AppCommand({
    ...leaderboard_cmd.options,
    options: [(await guildRankingsOption(app, guild_id, optionnames.ranking, false)) || []].flat(),
  })

export const leaderboardCmd = (app: App) =>
  leaderboard_cmd.onCommand(async ctx =>
    withSelectedRanking(app, ctx, optionnames.ranking, async ranking => {
      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: D.MessageFlags.Ephemeral },
        },
        async ctx => {
          ctx.state.save.ranking_id(ranking.data.id)
          await ctx.edit((await leaderboardMessage(ranking)).responsedata)
        },
      )
    }),
  )

export default new AppView(leaderboardCmd, leaderboardCmdDef)
