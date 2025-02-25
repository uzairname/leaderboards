import { PartialRanking } from '@repo/db/models'
import { CommandSignature, getOptions, InitialContext, ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { guildRankingsOption, withSelectedRanking } from '../../../utils/view-helpers/ranking-option'
import { leaderboardMessage } from '../leaderboard-message'

const leaderboard_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'lb',
  description: 'View the leaderboard for a ranking',
})

export const leaderboard_cmd = leaderboard_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    return new CommandSignature({
      ...leaderboard_cmd_sig.config,
      options: [(await guildRankingsOption(app, guild, 'ranking')) || []].flat(),
    })
  },
  onCommand: async (ctx, app) =>
    withSelectedRanking(
      {
        app,
        ctx,
        ranking_id: getOptions(ctx.interaction, {
          ranking: { type: D.ApplicationCommandOptionType.Integer },
        }).ranking,
      },
      async ranking => {
        const state = leaderboard_view_sig.newState({
          ranking_id: ranking.data.id,
          page: 1,
        })
        return ctx.defer(async ctx => {
          const message_data = await leaderboardPage(app, { ...ctx, state})
          await ctx.edit(message_data)
        })
      },
    ),
})

const leaderboard_view_sig = new ViewSignature({
  custom_id_prefix: 'lb',
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

export const leaderboard_view = leaderboard_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return ctx.defer(async ctx => {
      const current_page = ctx.state.get.page()

      const new_page = {
        start: 1,
        prev: current_page - 1,
        next: current_page + 1,
        end: ctx.state.get.max_page(),
      }[ctx.state.get.clicked_btn()]

      ctx.state.save.page(new_page)

      await ctx.edit(await leaderboardPage(app, ctx))
    })
  },
})

async function leaderboardPage(
  app: App,
  ctx: InitialContext<typeof leaderboard_view_sig>
): Promise<D.APIInteractionResponseCallbackData> {

  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
  const page = ctx.state.get.page()

  const { embeds, max_page } = await leaderboardMessage(app, ranking, {
    guild_id: ctx.interaction.guild_id,
    full: true,
    page: page
  })

  ctx.state.saveAll({ max_page })

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
