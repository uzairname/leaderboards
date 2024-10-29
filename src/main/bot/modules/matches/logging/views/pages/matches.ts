import * as D from 'discord-api-types/v10'
import { MessageView, field } from '../../../../../../../discord-framework'
import { ViewState } from '../../../../../../../discord-framework/interactions/view_state'
import { sentry } from '../../../../../../../logging/sentry'
import { App } from '../../../../../../app/App'
import { AppView } from '../../../../../../app/ViewModule'
import { Colors } from '../../../../../helpers/constants'
import { matchSummaryEmbed } from '../../match_summary_message'

export const matches_view = new MessageView({
  custom_id_prefix: 'mh',
  name: 'match history',
  state_schema: {
    message_sent: field.Boolean(),
    match_id: field.Int(),
    ranking_ids: field.Array(field.Int()),
    player_ids: field.Array(field.Int()),
    user_ids: field.Array(field.String()),
    page_num: field.Int(),
  },
})

export default new AppView(matches_view, app =>
  matches_view.onComponent(async ctx => {
    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredMessageUpdate,
      },
      async ctx => {
        return void (ctx.state.data.message_sent ? ctx.edit : ctx.followup)(
          await matchesPage(app, ctx.state.set.message_sent(true)),
        )
      },
    )
  }),
)

export async function matchesPage(
  app: App,
  state?: ViewState<typeof matches_view.state_schema>,
): Promise<D.APIInteractionResponseCallbackData> {
  state = state ?? matches_view.createState()

  state.saveAll({
    message_sent: true,
    page_num: state.data.page_num ?? 0,
  })

  const matches_per_page = 5

  sentry.debug(
    `matchespage params ${state.data.player_ids} ${state.data.user_ids} ${state.data.ranking_ids}`,
  )

  const filters = {
    player_ids: state.data.player_ids,
    user_ids: state.data.user_ids,
    ranking_ids: state.data.ranking_ids,
    limit: matches_per_page,
    offset: (state.data.page_num ?? 0) * matches_per_page,
    // status: MatchStatus.Finished,
  }

  const matches = await app.db.matches.getMany(filters)

  return {
    embeds:
      matches.length > 0
        ? await Promise.all(
            matches.map(
              async match =>
                await matchSummaryEmbed(app, match.match, {
                  ranking_name: true,
                  time_finished: true,
                  id: true,
                }),
            ),
          )
        : [
            {
              description: `No matches to show`,
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
            custom_id: state.set.page_num((state.data.page_num ?? 0) - 1).cId(),
            label: 'Newer',
            disabled: state.data.page_num === 0,
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Primary,
            custom_id: state.set.page_num((state.data.page_num ?? 0) + 1).cId(),
            label: 'Older',
            disabled: matches.length < matches_per_page,
          },
        ],
      },
    ],
    flags: D.MessageFlags.Ephemeral,
  }
}