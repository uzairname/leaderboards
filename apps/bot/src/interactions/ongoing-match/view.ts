import { ActionRowBuilder, ButtonBuilder, MessageActionRowComponentBuilder } from '@discordjs/builders'
import { MatchStatus, OutcomeType, WLDVote } from '@repo/db/models'
import { MessageData, ViewSignature, ViewState } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { ongoingMatchThreadMessage } from '../../services/matches/ongoing-match/ongoing-match-thread-message'
import { App } from '../../setup/app'
import * as handlers from './handlers'

export const ongoing_match_view_sig = new ViewSignature({
  name: 'Ongoing Series Message',
  custom_id_prefix: 'om',
  state_schema: {
    match_id: field.Int(),
    teams_to_rematch: field.Array(field.Bool()),
    teams_to_cancel: field.Array(field.Bool()),

    vote: field.Object({
      cancel: field.Bool(),
      wld: field.Choice(WLDVote),
      enter_result: field.Bool(),
    }),
    handler: field.Choice(handlers),
  },
})

export const ongoing_match_view = ongoing_match_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    const handler = ctx.state.get.handler()
    if (!handler) throw new Error('no callback')
    return await handler(app, ctx)
  },
})

export async function ongoingMatchPage(
  app: App,
  state: ViewState<typeof ongoing_match_view_sig.state_schema>,
): Promise<MessageData> {
  const match = await app.db.matches.fetch(state.get.match_id())
  const team_players = await match.teams()
  const ranking = await match.ranking.fetch()

  if (
    !app.config.features.AllowNon1v1Rankings &&
    !(team_players.length === 2 && team_players.every(t => t.length === 1))
  ) {
    throw new Error(`Invalid match team dimensions ${team_players}`)
  }

  const message = await ongoingMatchThreadMessage(app, match, team_players)

  let action_rows: D.APIActionRowComponent<D.APIComponentInMessageActionRow>[] = []

  let vote_btns = new ActionRowBuilder<MessageActionRowComponentBuilder>()

  const props = app.rankings.getProperties(ranking)

  if (props.match_settings.outcome_type === OutcomeType.WinLossDraw) {
    vote_btns.addComponents(
      new ButtonBuilder({
        style: D.ButtonStyle.Success,
        label: 'I won',
        custom_id: state
          .setAll({
            handler: handlers.vote,
            vote: { wld: WLDVote.Win },
          })
          .cId(),
      }),
      new ButtonBuilder({
        style: D.ButtonStyle.Danger,
        label: 'I lost',
        custom_id: state
          .setAll({
            handler: handlers.vote,
            vote: { wld: WLDVote.Loss },
          })
          .cId(),
      }),
    )

    if (ranking.data.match_settings?.draws_allowed) {
      vote_btns.addComponents(
        new ButtonBuilder({
          style: D.ButtonStyle.Primary,
          label: 'We drew',
          custom_id: state
            .setAll({
              handler: handlers.vote,
              vote: { wld: WLDVote.Draw },
            })
            .cId(),
        }),
      )
    }
  } else if (
    props.match_settings.outcome_type === OutcomeType.Points ||
    props.match_settings.outcome_type === OutcomeType.Ranks
  ) {
    vote_btns.addComponents(
      new ButtonBuilder({
        style: D.ButtonStyle.Primary,
        label: 'Enter results',
        custom_id: state
          .setAll({
            handler: handlers.vote,
            vote: { enter_result: true },
          })
          .cId(),
      }),
    )
  }

  vote_btns.addComponents(
    new ButtonBuilder({
      type: D.ComponentType.Button,
      style: D.ButtonStyle.Secondary,
      label: `Cancel`,
      custom_id: state
        .setAll({
          handler: handlers.vote,
          vote: { cancel: true },
        })
        .cId(),
    }),
  )

  const row_under_votes = new ActionRowBuilder<MessageActionRowComponentBuilder>()

  if (match.data.team_votes && Object.keys(match.data.team_votes).length > 0) {
    row_under_votes.addComponents(
      new ButtonBuilder({
        label: `Vote in Agreement`,
        style: D.ButtonStyle.Primary,
        custom_id: state
          .setAll({
            handler: handlers.agreeToVotes,
          })
          .cId(),
      }),
    )
  }

  row_under_votes.addComponents(
    new ButtonBuilder({
      label: `Undo Vote`,
      style: D.ButtonStyle.Secondary,
      custom_id: state
        .setAll({
          handler: handlers.undoVote,
        })
        .cId(),
    }),
  )

  const rematch_row = new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
    new ButtonBuilder({
      label: `Rematch`,
      style: D.ButtonStyle.Primary,
      custom_id: state
        .setAll({
          handler: handlers.rematch,
        })
        .cId(),
    }),
  )

  if (match.data.status === MatchStatus.Ongoing) {
    action_rows.push(vote_btns.toJSON())
    action_rows.push(row_under_votes.toJSON())
  } else if (match.data.status === MatchStatus.Finished || match.data.status === MatchStatus.Canceled) {
    action_rows.push(rematch_row.toJSON())
  }

  return new MessageData({
    ...message,
    components: action_rows,
  })
}
