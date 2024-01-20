import * as D from 'discord-api-types/v10'
import { MessageView, field } from '../../../discord-framework'
import { ViewState } from '../../../discord-framework/interactions/view_state'
import { App } from '../../app/app'
import { Colors } from '../../messages/message_pieces'
import { matchSummaryEmbed } from '../../modules/matches/match_logging/match_logging'

export const match_history_view = new MessageView({
  custom_id_prefix: 'mh',
  name: 'match history',
  state_schema: {
    on_page: field.Bool(),
    ranking_ids: field.Array(field.Int()),
    player_ids: field.Array(field.Int()),
    page: field.Int(),
    // callback: field.Choice({
    //   mainPage,
    // })
  },
})

export const matchHistoryView = (app: App) =>
  match_history_view.onComponent(async ctx => {
    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredMessageUpdate,
      },
      async ctx => {
        return void (ctx.state.data.on_page ? ctx.edit : ctx.followup)({
          ...(await mainPageData(app, ctx.state.set.on_page(true))),
          flags: D.MessageFlags.Ephemeral,
        })
      },
    )
  })

async function mainPageData(
  app: App,
  state?: ViewState<typeof match_history_view.state_schema>,
): Promise<D.APIInteractionResponseCallbackData> {
  state = state ?? match_history_view.newState()

  const matches_per_page = 5

  const matches = await Promise.all(
    await app.db.matches.get({
      player_ids: state.data.player_ids,
      ranking_ids: state.data.ranking_ids,
      limit_matches: matches_per_page,
      offset: (state.data.page ?? 0) * matches_per_page,
    }),
  )

  return {
    embeds:
      matches.length > 0
        ? await Promise.all(
            matches.map(
              async match =>
                await matchSummaryEmbed(app, match.match, match.teams, {
                  ranking_name: true,
                  time_finished: true,
                }),
            ),
          )
        : [
            {
              title: `No matches`,
              color: Colors.EmbedBackground,
            },
          ],
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Primary,
            custom_id: state.set.page((state.data.page ?? 0) - 1).cId(),
            label: 'Newer',
            disabled: state.data.page === 0,
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Primary,
            custom_id: state.set.page((state.data.page ?? 0) + 1).cId(),
            label: 'Older',
            disabled: matches.length < matches_per_page,
          },
        ],
      },
    ],
  }
}
