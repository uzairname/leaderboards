import { MatchStatus, Vote } from '@repo/db/models'
import { DeferredComponentContext, MessageData, ViewSignature, ViewState } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { UserError } from '../../../../errors/user-errors'
import { sentry } from '../../../../logging/sentry'
import { App } from '../../../../setup/app'
import { listToString } from '../../../../utils'
import { getOutcome } from '../../management/properties'
import { castPlayerVote, start1v1SeriesThread } from '../../ongoing-match/manage-ongoing-match'
import { ongoingMatch1v1Message } from '../../ongoing-match/ongoing-1v1-match-message'

export const ongoing_match_view_sig = new ViewSignature({
  name: 'Ongoing Series Message',
  custom_id_prefix: 'om',
  state_schema: {
    match_id: field.Int(),
    claim: field.Int(),
    teams_to_rematch: field.Array(field.Boolean()),
    teams_to_cancel: field.Array(field.Boolean()),
    handler: field.Choice({
      vote,
      rematch,
    }),
  },
})

export const ongoing_match_view = ongoing_match_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    const handler = ctx.state.get.handler()
    if (!handler) throw new Error('no callback')
    return ctx.defer(async ctx => handler(app, ctx))
  },
})

export async function ongoingMatchPage(
  app: App,
  state: ViewState<typeof ongoing_match_view_sig.state_schema>,
): Promise<MessageData> {
  const match = await app.db.matches.fetch(state.get.match_id())
  const team_players = await match.players()

  if (!app.config.features.AllowNon1v1 && !(team_players.length === 2 && team_players.every(t => t.length === 1))) {
    throw new Error(`Invalid match team dimensions ${team_players}`)
  }

  const message = await ongoingMatch1v1Message(app, match, team_players.flat())

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
  } else if (match.data.status === MatchStatus.Finished || match.data.status === MatchStatus.Canceled) {
    components = components.concat([
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Primary,
            label: `Rematch?`,
            custom_id: state.set.handler(rematch).cId(),
          },
        ],
      },
    ])
  }

  return new MessageData({
    ...message,
    components,
  })
}

async function vote(app: App, ctx: DeferredComponentContext<typeof ongoing_match_view_sig>): Promise<void> {
  const match = await app.db.matches.fetch(ctx.state.get.match_id())

  await castPlayerVote(app, match, ctx.interaction.member.user.id, ctx.state.get.claim())

  if (match.data.status === MatchStatus.Finished) {
    // Send a message indicating the winner
    const { winning_team_indices, is_draw } = getOutcome(match)
    const team_players = await match.players()
    if (is_draw) await ctx.send({ content: `It's a draw!` })
    else if (winning_team_indices) {
      const winning_teams = winning_team_indices.map(i => team_players[i])
      if (winning_teams.length === 1) {
        // One winning team (most cases)
        const winning_team = winning_teams[0]
        await ctx.send({
          content:
            winning_team.length > 1
              ? `${listToString(winning_team.map(p => `<@${p.player.data.user_id}>`))}'s team won!`
              : `<@${winning_team[0].player.data.user_id}> won!`,
        })
      } else {
        // Multiple winning teams (maybe count this as a draw)
        await ctx.send({ content: `It's a draw!` })
      }
    }
  }

  if (match.data.status === MatchStatus.Finished || match.data.status === MatchStatus.Canceled) {
    const thread_id = match.data.ongoing_match_channel_id
    if (thread_id) await app.discord.editChannel(thread_id, { archived: true })
  }

  await ctx.edit((await ongoingMatchPage(app, ctx.state)).as_response)
}

async function rematch(app: App, ctx: DeferredComponentContext<typeof ongoing_match_view_sig>): Promise<void> {
  const old_match = await app.db.matches.fetch(ctx.state.get.match_id())
  const team_players = await old_match.players()

  // check if user is in the match
  const user_id = ctx.interaction.member.user.id
  const team_index = team_players.findIndex(team => team.some(p => p.player.data.user_id === user_id))
  if (team_index == -1) throw new UserError(`You aren't participating in this match`)

  // set teams to rematch
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
    // Everyone wants to rematch.

    // Check if the rematch hasn't timed out
    const expires_at = new Date(
      (old_match.data.time_finished?.getTime() ?? Date.now()) + app.config.RematchTimeoutMinutes * 60 * 1000,
    )
    if (new Date() > expires_at) {
      throw new UserError(`Rematch window has expired`)
    }

    // archive thread
    old_match.data.ongoing_match_channel_id &&
      (await app.discord.editChannel(old_match.data.ongoing_match_channel_id, { archived: true }))

    // start the new match
    const { guild_ranking } = await app.db.guild_rankings.fetchBy({
      guild_id: ctx.interaction.guild_id,
      ranking_id: old_match.data.ranking_id,
    })
    const { thread } = await start1v1SeriesThread(
      app,
      guild_ranking,
      team_players.map(t => t.map(p => p.player)),
      old_match.data.metadata?.best_of,
    )
    ctx.state.save.teams_to_rematch(null)

    await ctx.send({
      content: `New match started in <#${thread.id}>`,
    })
  }

  sentry.debug(`teams to rematch ${ctx.state.data.teams_to_rematch}`)
  return void ctx.edit((await ongoingMatchPage(app, ctx.state)).as_response)
}
