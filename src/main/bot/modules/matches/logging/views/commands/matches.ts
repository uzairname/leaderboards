import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../../discord-framework'
import { GuildCommand } from '../../../../../../app/ViewModule'
import { checkGuildInteraction } from '../../../../../helpers/perms'
import {
  guildRankingsOption,
  withOptionalSelectedRanking,
} from '../../../../../helpers/ranking_command_option'
import {
  manage_match_page_signature,
  manageMatchPageData,
} from '../../../management/views/pages/manage_match'
import { matches_view, matchesPage } from '../pages/matches'

export const matches_command_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'matches',
  description: 'View the match history',
})

const optionnames = {
  ranking: 'ranking',
  user: 'player',
  match_id: 'id',
}

export default new GuildCommand(
  matches_command_signature,
  async (app, guild_id) => {
    const options: D.APIApplicationCommandOption[] = [
      {
        name: optionnames.match_id,
        type: D.ApplicationCommandOptionType.Integer,
        description: 'View details or manage a specific match',
      },
      {
        name: optionnames.user,
        type: D.ApplicationCommandOptionType.User,
        description: 'Filter matches by player',
      },
    ]

    return new AppCommand({
      ...matches_command_signature.signature,
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
      withOptionalSelectedRanking(app, ctx, optionnames.ranking, async ranking => {
        const user_option_value =
          (
            ctx.interaction.data.options?.find(o => o.name === optionnames.user) as
              | D.APIApplicationCommandInteractionDataUserOption
              | undefined
          )?.value ?? undefined

        const match_id_option_value =
          (
            ctx.interaction.data.options?.find(o => o.name === optionnames.match_id) as
              | D.APIApplicationCommandInteractionDataIntegerOption
              | undefined
          )?.value ?? undefined

        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: { flags: D.MessageFlags.Ephemeral },
          },
          async ctx => {
            // if a match id was provided, show the match page
            if (match_id_option_value !== undefined) {
              return void ctx.edit(
                await manageMatchPageData(app, {
                  ...ctx,
                  state: manage_match_page_signature.createState({
                    match_id: match_id_option_value,
                  }),
                }),
              )
            }

            let ranking_ids = ranking
              ? [ranking.data.id]
              : (
                  await app.db.guild_rankings.get({
                    guild_id: checkGuildInteraction(ctx.interaction).guild_id,
                  })
                ).map(r => r.ranking.data.id)

            await ctx.edit(
              await matchesPage(
                app,
                matches_view.createState({
                  ranking_ids,
                  user_ids: user_option_value ? [user_option_value] : undefined,
                }),
              ),
            )
          },
        )
      }),
    ),
)
