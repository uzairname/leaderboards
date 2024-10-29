import * as D from 'discord-api-types/v10'
import { AppCommand, field } from '../../../../../discord-framework'
import { GuildCommand } from '../../../../app/ViewModule'
import { guildRankingsOption, withSelectedRanking } from '../../../helpers/ranking_command_option'
import { leaderboardMessage } from '../leaderboard_message'

const optionnames = {
  ranking: 'ranking',
}

const leaderboard_cmd_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'lb',
  name: 'leaderboard',
  description: 'View the leaderboard for a ranking',

  state_schema: {
    page: field.Int(),
    ranking_id: field.Int(),
  },
})

export default new GuildCommand(
  leaderboard_cmd_signature,
  async (app, guild_id) =>
    new AppCommand({
      ...leaderboard_cmd_signature.signature,
      options: [(await guildRankingsOption(app, guild_id, optionnames.ranking)) || []].flat(),
    }),
  app =>
    leaderboard_cmd_signature.onCommand(async ctx =>
      withSelectedRanking(app, ctx, optionnames.ranking, async ranking => {
        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: { flags: D.MessageFlags.Ephemeral },
          },
          async ctx => {
            ctx.state.save.ranking_id(ranking.data.id)
            await ctx.edit((await leaderboardMessage(ranking)).as_response)
          },
        )
      }),
    ),
)
