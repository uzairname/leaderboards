import * as D from 'discord-api-types/v10'
import { CommandView, getOptions } from '../../../../discord-framework'
import {
  guildRankingsOption,
  withOptionalSelectedRanking,
} from '../../../ui-helpers/ranking-option'
import { GuildCommand } from '../../ViewModule'
import { profileOverviewPage, profile_page_config } from './profile-page'

const optionnames = {
  user: 'user',
  ranking: 'in-ranking',
}

export const profile_cmd_signature = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  name: 'profile',
  description: `View a player's stats`,
  guild_only: true,
})

export default new GuildCommand(
  profile_cmd_signature,
  async (app, guild) => {
    const options: D.APIApplicationCommandOption[] = [
      {
        name: optionnames.user,
        description: 'Leave blank to view your own',
        type: D.ApplicationCommandOptionType.User,
      },
    ]

    return new CommandView({
      ...profile_cmd_signature.config,
      options: options.concat(
        await guildRankingsOption(app, guild, optionnames.ranking, {
          optional: true,
        }),
      ),
    })
  },
  app =>
    profile_cmd_signature.onCommand(async ctx => {
      const input = getOptions(ctx.interaction, {
        user: { type: D.ApplicationCommandOptionType.User },
        ranking: { type: D.ApplicationCommandOptionType.Number },
      })

      return withOptionalSelectedRanking(app, ctx, input.ranking, {}, async ranking => {
        const target_user = input.user

        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          },
          async ctx => {
            return void ctx.edit(
              await profileOverviewPage(app, {
                ...ctx,
                state: profile_page_config.newState({
                  user_id: target_user?.id ?? ctx.interaction.member.user.id,
                  selected_ranking_id: ranking?.data.id,
                }),
              }),
            )
          },
        )
      })
    }),
)
