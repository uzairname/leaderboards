import * as D from 'discord-api-types/v10'
import { CommandView, getOptions } from '../../../../../discord-framework'
import { GuildCommand } from '../../../../app/ViewModule'
import { guildRankingsOption, withSelectedRanking } from '../../../ui-helpers/ranking-option'
import { leaderboardMessage } from '../leaderboard-message'
import { field } from '../../../../../utils/StringData'

const leaderboard_cmd_signature = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'lb',
  name: 'lb',
  description: 'View the leaderboard for a ranking',

  state_schema: {
    page: field.Int(),
    ranking_id: field.Int(),
  },
})

export default new GuildCommand(
  leaderboard_cmd_signature,
  async (app, guild) =>
    new CommandView({
      ...leaderboard_cmd_signature.config,
      options: [(await guildRankingsOption(app, guild, 'ranking')) || []].flat(),
    }),
  app =>
    leaderboard_cmd_signature.onCommand(async ctx =>
      withSelectedRanking(
        app,
        ctx,
        getOptions(ctx.interaction, {
          ranking: { type: D.ApplicationCommandOptionType.Integer },
        }).ranking,
        {},
        async ranking => {
          return ctx.defer(
            {
              type: D.InteractionResponseType.DeferredChannelMessageWithSource,
              data: { flags: D.MessageFlags.Ephemeral },
            },
            async ctx => {
              ctx.state.save.ranking_id(ranking.data.id)
              await ctx.edit(
                (
                  await leaderboardMessage(app, await ranking.fetch(), {
                    guild_id: ctx.interaction.guild_id,
                    full: true,
                  })
                ).as_response,
              )
            },
          )
        },
      ),
    ),
)
