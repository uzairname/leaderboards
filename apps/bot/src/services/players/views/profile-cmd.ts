import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { guildRankingsOption, withOptionalSelectedRanking } from '../../../utils/view-helpers/ranking-option'
import { profileOverviewPage, profile_view_sig } from './profile-view'

const optionnames = {
  user: 'user',
  ranking: 'in-ranking',
}

export const profile_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'profile',
  description: `View a player's stats`,
  guild_only: true,
})

export const profile_cmd = profile_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    const options: D.APIApplicationCommandOption[] = [
      {
        name: optionnames.user,
        description: 'Leave blank to view your own',
        type: D.ApplicationCommandOptionType.User,
      },
    ]

    return new CommandSignature({
      ...profile_cmd_sig.config,
      options: options.concat(
        await guildRankingsOption(app, guild, optionnames.ranking, {
          optional: true,
        }),
      ),
    })
  },
  onCommand: async (ctx, app) => {
    const input = getOptions(ctx.interaction, {
      user: { type: D.ApplicationCommandOptionType.User },
      ranking: { type: D.ApplicationCommandOptionType.Number },
    })

    return withOptionalSelectedRanking(app, ctx, input.ranking, {}, async ranking => {
      const target_user = input.user

      return ctx.defer(async ctx => {
          return void ctx.edit(
            await profileOverviewPage(app, {
              ...ctx,
              state: profile_view_sig.newState({
                user_id: target_user?.id ?? ctx.interaction.member.user.id,
                selected_ranking_id: ranking?.data.id,
              }),
            }),
          )
        },
      )
    })
  },
})
