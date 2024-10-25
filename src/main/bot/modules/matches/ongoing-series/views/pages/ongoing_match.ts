import * as D from 'discord-api-types/v10'
import {
  DeferContext,
  field,
  MessageData,
  MessageView,
} from '../../../../../../../discord-framework'
import { ViewState } from '../../../../../../../discord-framework/interactions/view_state'
import { nonNullable } from '../../../../../../../utils/utils'
import { App } from '../../../../../../context/app_context'
import { MatchStatus, Vote } from '../../../../../../database/models/matches'
import { AppMessages } from '../../../../../common/messages'
import { UserError } from '../../../../../utils/UserError'
import { AppView } from '../../../../../utils/ViewModule'
import { checkGuildInteraction } from '../../../../../utils/perms'
import { finishAndScoreMatch } from '../../../management/score_matches'
import { start1v1SeriesThread } from '../../start_series'

export const ongoing_series_msg_signature = new MessageView({
  name: "Ongoing series message",
  custom_id_prefix: 'om',
  state_schema: {
    match_id: field.Int(),
    claim: field.Int(),
    players_to_rematch: field.Array(field.Array(field.Boolean())),
    callback: field.Choice({
      rematch,
      confirm,
      vote,
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

  const team_votes = match.data.team_votes ?? team_players.map(_ => Vote.Undecided)

  // const teams_confirmed = state.data.teams_confirmed
  // state.save.teams_confirmed(teams_confirmed ?? team_players.map(_ => false))

  const content = AppMessages.ongoingMatch1v1Message(
    match,
    team_players.map(team => team.map(p => p.player)).flat(),
  )

  const num_win_votes = team_votes.filter(v => v === Vote.Win).length
  const num_undecided = team_votes.filter(v => v == Vote.Undecided).length
  const votes_agree = num_win_votes == 1 && num_undecided == 0

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
        ],
      },
    ])
  }

  if (votes_agree) {
    let buttons: D.APIButtonComponent[] = []
    // finished. Add rematch and close buttons
    if (match.data.status === MatchStatus.Ongoing) {
      buttons = buttons.concat([
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Secondary,
          label: 'Confirm',
          custom_id: state.set.callback(confirm).cId(),
        },
      ])
    }

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

async function vote(
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

  const team_votes = match.data.team_votes ?? team_players.map(team => Vote.Undecided)

  if (ctx.state.is.claim(Vote.Win)) {
    team_votes[team_index] = Vote.Win
  } else if (ctx.state.is.claim(Vote.Loss)) {
    team_votes[team_index] = Vote.Loss
  }

  await match.update({ team_votes: team_votes })

  return void ctx.edit((await ongoingMatchPage(app, ctx.state)).as_response)
}

async function confirm(
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

  const team_votes = nonNullable(match.data.team_votes, 'team_votes')

  const outcome = team_votes.map(v => (v === Vote.Win ? 1 : 0))
  await finishAndScoreMatch(app, match, outcome)

  return void ctx.edit((await ongoingMatchPage(app, ctx.state)).as_response)
}

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

  const teams_to_rematch =
    ctx.state.data.players_to_rematch ?? team_players.map(team => team.map(p => false))

  const player_index = team_players[team_index].findIndex(p => p.player.data.user_id === user_id)

  if (!teams_to_rematch[team_index][player_index]) {
    teams_to_rematch[team_index][player_index] = true
    ctx.state.save.players_to_rematch(teams_to_rematch)
    await ctx.followup({
      content: `<@${user_id}> wants to rematch`,
      allowed_mentions: { parse: [] },
    })
  }

  if (teams_to_rematch.every(t => t.every(p => p))) {
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
