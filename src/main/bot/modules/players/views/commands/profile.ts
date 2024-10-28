import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../discord-framework'
import { AppView } from '../../../../../app/ViewModule'
import { checkGuildInteraction } from '../../../../helpers/perms'
import { withSelectedRanking } from '../../../../helpers/ranking_command_option'
import { profile_page_signature, profileOverviewPage } from '../pages/profile'

const optionnames = {
  user: 'user',
  ranking: 'in-ranking',
}

export const stats_cmd_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'profile',
  description: `View a player's stats`,
  options: [
    {
      name: optionnames.user,
      description: 'Leave blank to view your own',
      type: D.ApplicationCommandOptionType.User,
    },
  ],
})

export default new AppView(stats_cmd_signature, app =>
  stats_cmd_signature.onCommand(async ctx =>
    withSelectedRanking(app, ctx, optionnames.ranking, async ranking => {
      const user_option_value = (
        ctx.interaction.data.options?.find(o => o.name === optionnames.user) as
          | D.APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value

      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: {
            flags: D.MessageFlags.Ephemeral,
          },
        },
        async ctx => {
          return void ctx.edit(
            await profileOverviewPage(app, {
              interaction: ctx.interaction,
              state: profile_page_signature.createState({
                user_id: user_option_value ?? checkGuildInteraction(ctx.interaction).member.user.id,
                selected_ranking_id: ranking.data.id,
              }),
            }),
          )
        },
      )
    }),
  ),
)
