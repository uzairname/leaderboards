import { PartialRanking } from 'database/models/rankings'
import * as D from 'discord-api-types/v10'
import { CommandView, DeferContext, getOptions } from 'discord-framework'
import { field } from '../../../../../../utils/StringData'
import { App } from '../../../setup/app'
import { guildRankingsOption, withSelectedRanking } from '../../../ui-helpers/ranking-option'
import { GuildCommand } from '../../ViewModule'
import { leaderboardMessage } from '../leaderboard-message'

const leaderboard_cmd_signature = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'lb',
  name: 'lb',
  description: 'View the leaderboard for a ranking',

  state_schema: {
    ranking_id: field.Int(),
    page: field.Int(),
    max_page: field.Int(),
    clicked_btn: field.Enum({
      start: null,
      prev: null,
      next: null,
      end: null,
    }),
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
    leaderboard_cmd_signature
      .onCommand(async ctx =>
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
                const message_data = await leaderboardPage(app, ctx, ranking, 1)
                await ctx.edit(message_data)
              },
            )
          },
        ),
      )
      .onComponent(async ctx => {
        const ranking_id = ctx.state.get.ranking_id()
        const ranking = await app.db.rankings.fetch(ranking_id)
        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredMessageUpdate,
          },
          async ctx => {
            const clicked_btn = ctx.state.get.clicked_btn()
            const current_page = ctx.state.get.page()

            const new_page = {
              start: 1,
              prev: current_page - 1,
              next: current_page + 1,
              end: ctx.state.get.max_page(),
            }[clicked_btn]

            await ctx.edit(await leaderboardPage(app, ctx, ranking, new_page))
          },
        )
      }),
)

async function leaderboardPage(
  app: App,
  ctx: DeferContext<typeof leaderboard_cmd_signature>,
  ranking: PartialRanking,
  page?: number,
): Promise<D.APIInteractionResponseCallbackData> {
  const { embeds, max_page } = await leaderboardMessage(app, await ranking.fetch(), {
    guild_id: ctx.interaction.guild_id,
    full: true,
    page: page,
  })

  ctx.state.saveAll({ max_page, page, ranking_id: ranking.data.id })

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
    {
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          emoji: { name: '⏮️' },
          custom_id: ctx.state.set.clicked_btn('start').cId(),
          disabled: page == 1,
        },
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          emoji: { name: '◀️' },
          custom_id: ctx.state.set.clicked_btn('prev').cId(),
          disabled: page == 1,
        },
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          emoji: { name: '▶️' },
          custom_id: ctx.state.set.clicked_btn('next').cId(),
          disabled: page == max_page,
        },
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          emoji: { name: '⏭️' },
          custom_id: ctx.state.set.clicked_btn('end').cId(),
          disabled: page == max_page,
        },
      ],
    },
  ]

  return {
    embeds,
    components,
  }
}
