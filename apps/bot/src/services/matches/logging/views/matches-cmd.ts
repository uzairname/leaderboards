import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../setup/app'
import { guildRankingsOption, withOptionalSelectedRanking } from '../../../../utils/view-helpers/ranking-option'
import { numRankings } from '../../../guilds/properties'
import { matches_view_sig, matchesPage } from './matches-view'

export const matches_command_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'matches',
  description: 'View the match history',
})

const optionnames = {
  ranking: 'ranking',
  user: 'player',
}

export const matches_cmd = matches_command_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    if ((await numRankings(app, guild)) == 0) return null

    const options: D.APIApplicationCommandOption[] = [
      {
        name: optionnames.user,
        type: D.ApplicationCommandOptionType.User,
        description: 'Filter matches by player',
      },
    ]

    return new CommandSignature({
      ...matches_command_sig.config,
      options: options.concat(
        await guildRankingsOption(app, guild, optionnames.ranking, { optional: true }, 'filter matches by ranking'),
      ),
    })
  },
  onCommand: async (ctx, app) =>
    withOptionalSelectedRanking({
      app,
      ctx,
      ranking_id: getOptions(ctx.interaction, { ranking: { type: D.ApplicationCommandOptionType.Integer } }).ranking,
    }, async ranking => {
      const user_option_value =
        (
          ctx.interaction.data.options?.find(o => o.name === optionnames.user) as
            | D.APIApplicationCommandInteractionDataUserOption
            | undefined
        )?.value ?? undefined

      return ctx.defer(
        async ctx => {
          const ranking_ids = ranking ? [ranking.data.id] : undefined

          // if not filtering by ranking, filtery by all matches in the guild
          const guild_id = ranking_ids === undefined ? ctx.interaction.guild_id : undefined

          await ctx.edit(
            await matchesPage(app, {state: matches_view_sig.newState({
              ranking_ids,
              guild_id,
              user_ids: user_option_value ? [user_option_value] : undefined,
            })}
          ),
          )
        },
      )
    }),
})
