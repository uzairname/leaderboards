import * as D from 'discord-api-types/v10'
import { MatchStatus, Vote } from '../../../../../../../database/models/matches'
import {
  DeferContext,
  field,
  MessageData,
  MessageView,
} from '../../../../../../../discord-framework'
import { ViewState } from '../../../../../../../discord-framework/interactions/view_state'
import { App } from '../../../../../../app/App'
import { AppView } from '../../../../../../app/ViewModule'
import { UserError } from '../../../../../errors/UserError'
import { Messages } from '../../../../../helpers/messages/'
import { checkGuildInteraction } from '../../../../../helpers/perms'
import { revertMatch } from '../../../management/manage_matches'
import { onPlayerVote, start1v1SeriesThread } from '../../manage_ongoing_match'

export const ongoing_series_msg_signature = new MessageView({
  name: 'Ongoing series message',
  custom_id_prefix: 'om',
  state_schema: {
    match_id: field.Int(),
    claim: field.Int(),
    teams_to_rematch: field.Array(field.Boolean()),
    teams_to_cancel: field.Array(field.Boolean()),
    callback: field.Choice({
      vote,
      cancel,
      rematch,
      // confirm,
    }),
  },
})

export default new AppView(ongoing_series_msg_signature, app =>
  ongoing_series_msg_signature.onComponent(async ctx => {
    if (!ctx.state.data.callback) throw new Error('no callback')
    const callback = ctx.state.data.callback
    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredMessageUpdate,
      },
      async ctx_ => callback(app, ctx_),
    )
  }),
)

export async function ongoingMatchPage(
  app: App,
  state: ViewState<typeof ongoing_series_msg_signature.state_schema>,
): Promise<MessageData> {
  const match = await app.db.matches.get(state.get.match_id())
  const team_players = await match.teamPlayers()

  if (
    !app.config.features.MultipleTeamsPlayers &&
    !(team_players.length === 2 && team_players.every(t => t.length === 1))
  ) {
    throw new Error('Non 1v1 matches not supported')
  }

  const message = Messages.ongoingMatch1v1Message(
    match,
    team_players.map(team => team.map(p => p.player)).flat(),
  )

  let components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = []

  if (match.data.status === MatchStatus.Ongoing) {
    components = components.concat([
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Success,
            label: 'I won',
            custom_id: state
              .setAll({
                callback: vote,
                claim: Vote.Win,
              })
              .cId(),
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Danger,
            label: 'I lost',
            custom_id: state
              .setAll({
                callback: vote,
                claim: Vote.Loss,
              })
              .cId(),
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Secondary,
            label: `Cancel`,
            custom_id: state
            .setAll({
              callback: vote,
              claim: Vote.Cancel,
            })
            .cId(),
          },
        ],
      },
    ])
  }

  let buttons2: D.APIButtonComponent[] = []

  // if (votes_agree) {
  //   // finished. Add confirm button
  //   if (match.data.status === MatchStatus.Ongoing) {
  //     buttons2 = buttons2.concat([
  //       {
  //         type: D.ComponentType.Button,
  //         style: D.ButtonStyle.Secondary,
  //         label: `Confirm: ${truncateString(winner_name, 20)} won`,
  //         custom_id: state.set.callback(confirm).cId(),
  //       },
  //     ])
  //   }
  // }

  if (match.data.status === MatchStatus.Finished) {
    buttons2 = buttons2.concat([
      {
        type: D.ComponentType.Button,
        style: D.ButtonStyle.Primary,
        label: 'Rematch',
        custom_id: state.set.callback(rematch).cId(),
      },
    ])
    components = components.concat([
      {
        type: D.ComponentType.ActionRow,
        components: buttons2,
      },
    ])
  }

  return new MessageData({
    ...message,
    components,
  })
}

async function vote(
  app: App,
  ctx: DeferContext<typeof ongoing_series_msg_signature>,
): Promise<void> {
  const interaction = checkGuildInteraction(ctx.interaction as D.APIMessageComponentInteraction)
  const match = await app.db.matches.get(ctx.state.get.match_id())

  await onPlayerVote(app, match, interaction.member.user.id, ctx.state.get.claim())

  await ctx.edit((await ongoingMatchPage(app, ctx.state)).as_response)
}

async function cancel(
  app: App,
  ctx: DeferContext<typeof ongoing_series_msg_signature>,
): Promise<void> {
  const interaction = checkGuildInteraction(ctx.interaction)

  const match = await app.db.matches.get(ctx.state.get.match_id())
  // Make sure the match is ongoing
  if (match.data.status !== MatchStatus.Ongoing) return

  const team_players = await match.teamPlayers()

  // check if user is in the match
  const user_id = interaction.member.user.id
  const team_index = team_players.findIndex(team =>
    team.some(p => p.player.data.user_id === user_id),
  )
  if (team_index == -1) throw new UserError(`You aren't participating in this match`)

  const teams_to_cancel = ctx.state.data.teams_to_cancel ?? team_players.map(team => false)

  if (!teams_to_cancel[team_index]) {
    teams_to_cancel[team_index] = true
    ctx.state.save.teams_to_cancel(teams_to_cancel)
    await ctx.followup({
      content: `<@${user_id}> wants to cancel`,
      allowed_mentions: { parse: [] },
    })
  }

  if (teams_to_cancel.every(v => v)) {
    await revertMatch(app, match)
  }
}

// async function confirm(
//   app: App,
//   ctx: DeferContext<typeof ongoing_series_msg_signature>,
// ): Promise<void> {
//   const interaction = checkGuildInteraction(ctx.interaction)

//   const match = await app.db.matches.get(ctx.state.get.match_id())
//   const team_players = await match.teamPlayers()

//   // check if user is in the match
//   const user_id = interaction.member.user.id
//   const team_index = team_players.findIndex(team =>
//     team.some(p => p.player.data.user_id === user_id),
//   )
//   if (team_index == -1) throw new UserError(`You aren't participating in this match`)

//   const team_votes = nonNullable(match.data.team_votes, 'team_votes')
//   const num_win_votes = team_votes.filter(v => v === Vote.Win).length
//   const num_undecided = team_votes.filter(v => v == Vote.Undecided).length
//   const votes_agree = num_win_votes === 1 && num_undecided === 0

//   if (!votes_agree) return

//   const outcome = team_votes.map(v => (v === Vote.Win ? 1 : 0))
//   await finishAndScoreMatch(app, match, outcome)

//   return void ctx.edit((await ongoingMatchPage(app, ctx.state)).as_response)
// }

async function rematch(
  app: App,
  ctx: DeferContext<typeof ongoing_series_msg_signature>,
): Promise<void> {
  const interaction = checkGuildInteraction(ctx.interaction)

  const match = await app.db.matches.get(ctx.state.get.match_id())
  const team_players = await match.teamPlayers()

  // check if user is in the match
  const user_id = interaction.member.user.id
  const team_index = team_players.findIndex(team =>
    team.some(p => p.player.data.user_id === user_id),
  )
  if (team_index == -1) throw new UserError(`You aren't participating in this match`)

  const teams_to_rematch = ctx.state.data.teams_to_rematch ?? team_players.map(team => false)

  if (!teams_to_rematch[team_index]) {
    teams_to_rematch[team_index] = true
    ctx.state.save.teams_to_rematch(teams_to_rematch)
    await ctx.followup({
      content: `<@${user_id}> wants to rematch`,
      allowed_mentions: { parse: [] },
    })
  }

  if (teams_to_rematch.every(v => v)) {
    const guild_ranking = await app.db.guild_rankings.get({
      guild_id: interaction.guild_id,
      ranking_id: match.data.ranking_id,
    })

    const { thread } = await start1v1SeriesThread(
      app,
      guild_ranking,
      team_players.map(t => t.map(p => p.player)),
      match.data.metadata?.best_of,
    )

    await ctx.followup({
      content: `New match started in <#${thread.id}>`,
    })
  }

  return void ctx.edit((await ongoingMatchPage(app, ctx.state)).as_response)
}
