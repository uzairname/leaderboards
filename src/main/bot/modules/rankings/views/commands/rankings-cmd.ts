import * as D from 'discord-api-types/v10'
import { CommandView, getOptions } from '../../../../../../discord-framework'
import { GuildCommand } from '../../../../../app/ViewModule'
import {
  guildRankingsOption,
  withOptionalSelectedRanking,
} from '../../../../ui-helpers/ranking-option'
import { allRankingsPage } from '../pages/all-rankings-page'
import { rankingSettingsPage } from '../pages/ranking-settings-page'
import { field } from '../../../../../../utils/StringData'

export const rankings_cmd_signature = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'r',
  name: 'rankings',
  state_schema: {
    on_page: field.Enum({
      all_rankings: null,
    }),
  },
  description: 'Create and edit rankings in this server',
  guild_only: true,
})

export default new GuildCommand(
  rankings_cmd_signature,
  async (app, guild) =>
    new CommandView({
      ...rankings_cmd_signature.config,
      options: await guildRankingsOption(app, guild, 'ranking', {
        optional: true,
      }),
    }),
  app => {
    return rankings_cmd_signature
      .onCommand(async ctx =>
        withOptionalSelectedRanking(
          app,
          ctx,
          getOptions(ctx.interaction, { ranking: { type: D.ApplicationCommandOptionType.Integer } })
            .ranking,
          {},
          async ranking => {
            return ctx.defer(
              {
                type: D.InteractionResponseType.DeferredChannelMessageWithSource,
                data: { flags: D.MessageFlags.Ephemeral },
              },
              async ctx => {
                if (ranking) {
                  await ctx.followup(
                    await rankingSettingsPage({ app, ctx, ranking_id: ranking.data.id }),
                  )
                } else {
                  await ctx.followup(await allRankingsPage(app, ctx))
                }
              },
            )
          },
        ),
      )

      .onComponent(async ctx => {
        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: { flags: D.MessageFlags.Ephemeral },
          },
          async ctx => ctx.edit(await allRankingsPage(app, ctx)),
        )
      })
  },
)
