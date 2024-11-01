import * as D from 'discord-api-types/v10'
import { MatchStatus, Vote } from '../../../../../../../database/models/matches'
import {
  DeferContext,
  field,
  MessageData,
  MessageView,
} from '../../../../../../../discord-framework'
import { ViewState } from '../../../../../../../discord-framework/interactions/view-state'
import { maxIndex, nonNullable } from '../../../../../../../utils/utils'
import { App } from '../../../../../../app/App'
import { AppView } from '../../../../../../app/ViewModule'
import { UserError } from '../../../../../errors/UserError'
import { Messages } from '../../../../../ui-helpers/messages'
import {
  checkGuildComponentInteraction,
  checkGuildInteraction,
} from '../../../../../ui-helpers/perms'
import { revertMatch } from '../../../management/manage-matches'
import { start1v1SeriesThread } from '../../../management/match-creation'
import { castPlayerVote } from '../../manage_ongoing_match'

export const ongoing_series_page_config = new MessageView({
  name: 'Ongoing series message',
  custom_id_prefix: 'om',
  state_schema: {
    match_id: field.Int(),
    claim: field.Int(),
    teams_to_rematch: field.Array(field.Boolean()),
    teams_to_cancel: field.Array(field.Boolean()),
    handler: field.Choice({
      vote,
      cancel,
      rematch,
      // confirm,
    }),
  },
})

export default new AppView(ongoing_series_page_config, app =>
  ongoing_series_page_config.onComponent(async ctx => {
    const handler = ctx.state.get.handler()
    if (!handler) throw new Error('no callback')
    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredMessageUpdate,
      },
      async ctx_ => handler(app, ctx_),
    )
  }),
)

export async function ongoingMatchPage(
  app: App,
  state: ViewState<typeof ongoing_series_page_config.state_schema>,
): Promise<MessageData> {
  const match = await app.db.matches.get(state.get.match_id())
  const team_players = await match.teamPlayers()

  if (
    !app.config.features.MultipleTeamsPlayers &&
    !(team_players.length === 2 && team_players.every(t => t.length === 1))
  ) {
    throw new Error(`Invalid match team dimensions ${team_players}`)
  }

  const message = Messages.ongoingMatch1v1Message(match, team_players)

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
                handler: vote,
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
                handler: vote,
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
                handler: vote,
                claim: Vote.Cancel,
              })
              .cId(),
          },
        ],
      },
    ])
  }

  
  if (match.data.status === MatchStatus.Scored || match.data.status === MatchStatus.Canceled) {
    let buttons2: D.APIButtonComponent[] = []
    buttons2.push({
        type: D.ComponentType.Button,
        style: D.ButtonStyle.Primary,
        label: `Rematch?`,
        custom_id: state.set.handler(rematch).cId(),
      })

    components.push({
      type: D.ComponentType.ActionRow,
      components: buttons2,
    })
  }

  return new MessageData({
    ...message,
    components,
  })
}

async function vote(app: App, ctx: DeferContext<typeof ongoing_series_page_config>): Promise<void> {
  const interaction = checkGuildInteraction(ctx.interaction as D.APIMessageComponentInteraction)
  const match = await app.db.matches.get(ctx.state.get.match_id())

  await castPlayerVote(app, match, interaction.member.user.id, ctx.state.get.claim())

  if (match.data.status === MatchStatus.Scored) {
    const team_players = await match.teamPlayers()
    const outcome = nonNullable(match.data.outcome, 'finished match outcome')
    const winner_index = maxIndex(outcome)
    const winner = team_players[winner_index][0]

    await ctx.send({ content: `### <@${winner.player.data.user_id}> wins!` })
  }

  await ctx.edit((await ongoingMatchPage(app, ctx.state)).as_response)
}

async function cancel(
  app: App,
  ctx: DeferContext<typeof ongoing_series_page_config>,
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

async function rematch(
  app: App,
  ctx: DeferContext<typeof ongoing_series_page_config>,
): Promise<void> {
  const interaction = checkGuildComponentInteraction(ctx.interaction)
  const match = await app.db.matches.get(ctx.state.get.match_id())
  const team_players = await match.teamPlayers()

  // check if user is in the match
  const user_id = interaction.member.user.id
  const team_index = team_players.findIndex(team =>
    team.some(p => p.player.data.user_id === user_id),
  )
  if (team_index == -1) throw new UserError(`You aren't participating in this match`)

  const teams_to_rematch = ctx.state.data.teams_to_rematch ?? team_players.map(_ => false)

  if (!teams_to_rematch[team_index]) {
    teams_to_rematch[team_index] = true
    ctx.state.save.teams_to_rematch(teams_to_rematch)
    await ctx.send({
      content: `<@${user_id}> wants to rematch`,
      allowed_mentions: { parse: [] },
    })
  }

  if (teams_to_rematch.every(v => v)) {
    ctx.state.save.teams_to_rematch([])

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

    await ctx.send({
      content: `New match started in <#${thread.id}>`,
    })
  }

  return void ctx.edit((await ongoingMatchPage(app, ctx.state)).as_response)
}
