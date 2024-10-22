import * as D from 'discord-api-types/v10'
import {
  DeferContext,
  field,
  MessageData,
  MessageView,
} from '../../../../../../../discord-framework'
import { ViewState } from '../../../../../../../discord-framework/interactions/view_state'
import { sentry } from '../../../../../../../logging'
import { nonNullable } from '../../../../../../../utils/utils'
import { App } from '../../../../../../context/app_context'
import { MatchStatus, Vote } from '../../../../../../database/models/matches'
import { AppMessages } from '../../../../../common/messages'
import { AppView } from '../../../../../utils/ViewModule'
import { checkGuildInteraction } from '../../../../../utils/perms'
import { finishAndScoreMatch } from '../../../recording/score_matches'
import { startNewMatch } from '../../start_match'

export const ongoing_match_msg_signature = new MessageView({
  custom_id_prefix: 'om',
  state_schema: {
    match_id: field.Int(),
    claim: field.Int(),
    callback: field.Choice({
      rematch,
      finish,
    }),
  },
})

export default new AppView(app =>
  ongoing_match_msg_signature.onComponent(async ctx => {
    if (ctx.state.data.callback !== undefined) {
      const callback = ctx.state.data.callback
      ctx.state.save.callback(undefined)
      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredMessageUpdate,
        },
        async ctx_ => callback(app, ctx_),
      )
    }

    const interaction = checkGuildInteraction(ctx.interaction)
    const match = await app.db.matches.get(ctx.state.get.match_id())

    if (ctx.state.data.claim !== undefined) {
      const team_user_ids = (await match.teamPlayers()).map(team =>
        team.map(p => p.player.data.user_id),
      )
      const team_votes = match.data.team_votes ?? team_user_ids.map(_ => Vote.Undecided)

      // update team votes

      const user_id = interaction.member.user.id
      const team_index = team_user_ids.findIndex(team => team.some(id => id === user_id))

      if (ctx.state.is.claim(Vote.Win)) {
        team_votes[team_index] = Vote.Win
      } else if (ctx.state.is.claim(Vote.Loss)) {
        team_votes[team_index] = Vote.Loss
      }

      await match.update({ team_votes: team_votes })
    }

    sentry.debug('ongoing match page update', { active_match_id: match.data.id })

    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: (await ongoingMatchPage(app, ctx.state)).as_response,
    }
  }),
)

export async function ongoingMatchPage(
  app: App,
  state: ViewState<typeof ongoing_match_msg_signature.state_schema>,
): Promise<MessageData> {
  const match = await app.db.matches.get(state.get.match_id())
  const team_players = await match.teamPlayers()
  const team_votes = match.data.team_votes ?? team_players.map(_ => Vote.Undecided)

  const content = AppMessages.ongoingMatch1v1Message(
    match,
    team_players.map(team => team.map(p => p.player)).flat(),
  )

  let components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = []

  const num_win_votes = team_votes.filter(v => v === Vote.Win).length
  const num_undecided = team_votes.filter(v => v == Vote.Undecided).length

  const votes_agree = num_win_votes == 1 && num_undecided == 0

  if (match.data.status !== MatchStatus.Finished) {

    components = components.concat([
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Success,
            label: 'I won',
            custom_id: state.set.claim(Vote.Win).cId(),
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Danger,
            label: 'I lost',
            custom_id: state.set.claim(Vote.Loss).cId(),
          },
        ],
      },
    ])

  }

  if (votes_agree) {
    // finished. Add rematch and close buttons

    let buttons: D.APIButtonComponent[] = [
      {
        type: D.ComponentType.Button,
        style: D.ButtonStyle.Secondary,
        label: 'Confirm',
        custom_id: state.set.callback(finish).cId(),
      },
    ]

    if (match.data.status === MatchStatus.Finished) {
      buttons = buttons.concat([
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          label: 'Rematch',
          custom_id: state.set.callback(rematch).cId(),
        },
      ])
    }

    components = components.concat([
      {
        type: D.ComponentType.ActionRow,
        components: buttons,
      },
    ])
  }

  return new MessageData({
    content,
    components,
  })
}

async function rematch(
  app: App,
  ctx: DeferContext<typeof ongoing_match_msg_signature>,
): Promise<void> {
  const interaction = checkGuildInteraction(ctx.interaction)

  const match = await app.db.matches.get(ctx.state.get.match_id())

  const team_votes = nonNullable(match.data.team_votes, 'team_votes')
  const outcome = team_votes.map(v => (v === Vote.Win ? 1 : 0))
  await finishAndScoreMatch(app, match, outcome)

  const players = await match.teamPlayers()
  const guild_ranking = await app.db.guild_rankings.get({
    guild_id: interaction.guild_id,
    ranking_id: match.data.ranking_id,
  })

  const new_match = await startNewMatch(app, guild_ranking, players)
  ctx.state.save.match_id(new_match.data.id)

  return void ctx.edit((await ongoingMatchPage(app, ctx.state)).as_response)
}

async function finish(
  app: App,
  ctx: DeferContext<typeof ongoing_match_msg_signature>,
): Promise<void> {
  const match = await app.db.matches.get(ctx.state.get.match_id())

  const team_votes = nonNullable(match.data.team_votes, 'team_votes')
  const outcome = team_votes.map(v => (v === Vote.Win ? 1 : 0))
  await finishAndScoreMatch(app, match, outcome)


  // lock the thread
  await app.bot.editChannel

  return void ctx.edit((await ongoingMatchPage(app, ctx.state)).as_response)
}
