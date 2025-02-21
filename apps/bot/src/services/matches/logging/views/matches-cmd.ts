import { CommandView, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { GuildCommand } from '../../../../classes/ViewModule'
import {
  guildRankingsOption,
  withOptionalSelectedRanking,
} from '../../../../ui-helpers/ranking-option'
import { matchesPage } from './matches-page'

export const matches_command_signature = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  name: 'matches',
  description: 'View the match history',
})

const optionnames = {
  ranking: 'ranking',
  user: 'player',
}

export default new GuildCommand(
  matches_command_signature,
  async (app, guild_id) => {
    const options: D.APIApplicationCommandOption[] = [
      {
        name: optionnames.user,
        type: D.ApplicationCommandOptionType.User,
        description: 'Filter matches by player',
      },
    ]

    return new CommandView({
      ...matches_command_signature.config,
      options: options.concat(
        await guildRankingsOption(
          app,
          guild_id,
          optionnames.ranking,
          { optional: true },
          'filter matches by ranking',
        ),
      ),
    })
  },
  app =>
    matches_command_signature.onCommand(async ctx =>
      withOptionalSelectedRanking(
        app,
        ctx,
        getOptions(ctx.interaction, { ranking: { type: D.ApplicationCommandOptionType.Integer } })
          .ranking,
        {},
        async ranking => {
          const user_option_value =
            (
              ctx.interaction.data.options?.find(o => o.name === optionnames.user) as
                | D.APIApplicationCommandInteractionDataUserOption
                | undefined
            )?.value ?? undefined

          return ctx.defer(
            {
              type: D.InteractionResponseType.DeferredChannelMessageWithSource,
              data: { flags: D.MessageFlags.Ephemeral },
            },
            async ctx => {
              const ranking_ids = ranking ? [ranking.data.id] : undefined

              // if not filtering by ranking, filtery by all matches in the guild
              const guild_id = ranking_ids === undefined ? ctx.interaction.guild_id : undefined

              await ctx.edit(
                await matchesPage(app, {
                  ranking_ids,
                  guild_id,
                  user_ids: user_option_value ? [user_option_value] : undefined,
                }),
              )
            },
          )
        },
      ),
    ),
)
