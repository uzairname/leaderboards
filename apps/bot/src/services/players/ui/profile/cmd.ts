import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { ProfilePages } from '.'
import { App } from '../../../../setup/app'
import { guildRankingsOption, withOptionalSelectedRanking } from '../../../../utils/ui/view-helpers/ranking-option'
import { profile_view_sig } from './view'

const optionnames = {
  user: 'user',
  ranking: 'ranking',
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
    let options: D.APIApplicationCommandOption[] = [
      {
        name: optionnames.user,
        description: 'Leave blank to view your own',
        type: D.ApplicationCommandOptionType.User,
      },
    ]

    options = options.concat(
      await guildRankingsOption(app, guild, optionnames.ranking, {
        optional: true,
      }),
    )

    options.push({
      name: 'ephemeral',
      description: 'Make the message only visible to you',
      type: D.ApplicationCommandOptionType.Boolean,
      required: false,
    })

    return new CommandSignature({
      ...profile_cmd_sig.config,
      options,
    })
  },
  onCommand: async (ctx, app) => {
    const options = getOptions(ctx.interaction, {
      user: { type: D.ApplicationCommandOptionType.User },
      ranking: { type: D.ApplicationCommandOptionType.Integer, name: optionnames.ranking },
      ephemeral: { type: D.ApplicationCommandOptionType.Boolean, default: false },
    })

    return withOptionalSelectedRanking(
      { app, ctx, ranking_id: options.ranking, prefer_default: true },
      async ranking => {
        const target_user = options.user

        const state = profile_view_sig.newState({
          user_id: target_user?.id ?? ctx.interaction.member.user.id,
          ranking_id: ranking?.data.id,
        })

        return ctx.defer(
          async ctx => {
            return void (await ctx.edit(
              await ProfilePages.main(app, {
                ...ctx,
                state,
              }),
            ))
          },
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: { flags: options.ephemeral ? D.MessageFlags.Ephemeral : undefined },
          },
        )
      },
    )
  },
})
