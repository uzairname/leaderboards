import { CommandSignature, getOptions, InitialContext } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { guildRankingsOption, withSelectedRanking } from '../../../utils/view-helpers/ranking-option'
import { leaderboardMessage } from '../leaderboard-message'
import { leaderboard_view_sig } from './leaderboard-view'

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
          const message_data = await leaderboardPage(app, { ...ctx, state })
          await ctx.edit(message_data)
        })
      },
    ),
})

export async function leaderboardPage(
  app: App,
  ctx: InitialContext<typeof leaderboard_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
  const page = ctx.state.get.page()

  const { embeds, max_page } = await leaderboardMessage(app, ranking, {
    guild_id: ctx.interaction.guild_id,
    full: true,
    page: page,
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
