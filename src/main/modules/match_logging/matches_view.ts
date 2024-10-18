import * as D from 'discord-api-types/v10'
import { TlsOptions_Version } from 'miniflare'
import { MessageView, field } from '../../../../discord-framework'
import { ViewState } from '../../../../discord-framework/interactions/view_state'
import { App } from '../../../app-context/app-context'
import { Colors } from '../../../messages/message_pieces'
import { globalView, guildCommand } from '../../../view_manager/view_module'
import { matchSummaryEmbed } from './match_messages'
import { matchView } from './match_view'
import { matchesCommand, matchesCommandDef } from './matches_command'

export const match_history_view_definition = new MessageView({
  custom_id_prefix: 'mh',
  name: 'match history',
  state_schema: {
    message_sent: field.Bool(),
    match_id: field.Int(),
    ranking_ids: field.Array(field.Int()),
    player_ids: field.Array(field.Int()),
    user_ids: field.Array(field.String()),
    page_num: field.Int(),
  },
})

export const matchesView = (app: App) =>
  match_history_view_definition.onComponent(async ctx => {
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
  })

export async function matchesPage(
  app: App,
  state?: ViewState<typeof match_history_view_definition.state_schema>,
): Promise<D.APIInteractionResponseCallbackData> {
  state = state ?? match_history_view_definition.newState()

  state.saveAll({
    message_sent: true,
    page_num: state.data.page_num ?? 0,
  })

  const matches_per_page = 5

  const matches = await Promise.all(
    await app.db.matches.getMany({
      player_ids: state.data.player_ids,
      user_ids: state.data.user_ids,
      ranking_ids: state.data.ranking_ids,
      limit_matches: matches_per_page,
      offset: (state.data.page_num ?? 0) * matches_per_page,
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

export const matches_module = [
  globalView(matchesView),
  globalView(matchView),
  guildCommand(matchesCommand, matchesCommandDef),
]
