import * as D from 'discord-api-types/v10'
import { MessageView, field } from '../../../../../../../discord-framework'
import { App } from '../../../../../../app/App'
import { AppView } from '../../../../../../app/ViewModule'
import { Colors } from '../../../../../ui-helpers/constants'
import { matchSummaryEmbed } from '../../match-summary-message'

export const matches_page_config = new MessageView({
  custom_id_prefix: 'mh',
  name: 'match history',
  state_schema: {
    message_sent: field.Boolean(),
    match_id: field.Int(),
    guild_id: field.String(),
    ranking_ids: field.Array(field.Int()),
    player_ids: field.Array(field.Int()),
    user_ids: field.Array(field.String()),
    page_num: field.Int(),
  },
})

export default new AppView(matches_page_config, app =>
  matches_page_config.onComponent(async ctx => {
    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredMessageUpdate,
      },
      async ctx => {
        return void (ctx.state.data.message_sent ? ctx.edit : ctx.followup)(
          await matchesPage(app, ctx.state.set.message_sent(true).data),
        )
      },
    )
  }),
)

export async function matchesPage(
  app: App,
  data: Parameters<(typeof matches_page_config)['newState']>[0],
): Promise<D.APIInteractionResponseCallbackData> {
  const state = matches_page_config.newState(data)

  state.saveAll({
    message_sent: true,
    page_num: state.data.page_num ?? 0,
  })

  const matches_per_page = 5

  const matches = await app.db.matches.getMany({
    player_ids: state.data.player_ids,
    user_ids: state.data.user_ids,
    ranking_ids: state.data.ranking_ids,
    guild_id: state.data.guild_id,
    limit: matches_per_page + 1, // +1 to check if there are more pages
    offset: (state.data.page_num ?? 0) * matches_per_page,
    // status: MatchStatus.Finished,
  })

  // determine if on last page
  const is_last_page = matches.length <= matches_per_page
  if (matches.length > matches_per_page) {
    matches.shift()
  }

  return {
    embeds:
      matches.length > 0
        ? await Promise.all(matches.map(async match => await matchSummaryEmbed(app, match.match)))
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
            disabled: is_last_page,
          },
        ],
      },
    ],
    flags: D.MessageFlags.Ephemeral,
  }
}
