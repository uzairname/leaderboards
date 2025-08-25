import { MatchStatus, OutcomeType } from '@repo/db/models'
import { ChatInteractionResponse, ComponentContext } from '@repo/discord'
import { listToString } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { AppErrors } from '../../errors/app-errors'
import { UserError } from '../../errors/user-errors'
import { App } from '../../setup/app'
import { matchTeamPointsModal } from './modals'
import { ongoing_match_view_sig, ongoingMatchPage } from './view'

/**
 * Called when a player votes on the outcome of an ongoing match.
 * Assumes that 'vote' is set in the state
 */
export async function vote(
  app: App,
  ctx: ComponentContext<typeof ongoing_match_view_sig>,
): Promise<ChatInteractionResponse> {
  const match = await app.db.matches.fetch(ctx.state.get.match_id())

  const btn_vote = ctx.state.get.vote()

  if (btn_vote.enter_result) {
    const teams = await match.teams()

    // send a dialog to enter the result
    const ranking = await match.ranking.fetch()
    const props = app.rankings.getProperties(ranking)
    const outcome_type = props.match_settings.outcome_type

    if (outcome_type === OutcomeType.Ranks) {
      // Send a select menu
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `Ranks`,
          flags: D.MessageFlags.Ephemeral,
        },
      }
    } else if (outcome_type === OutcomeType.Points) {
      if (teams.length <= 5) {
        // send a modal to enter points for each team
        return {
          type: D.InteractionResponseType.Modal,
          data: await matchTeamPointsModal(teams),
        }
      }
      // Send a select menu to enter points for each team
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `5+ teams`,
          flags: D.MessageFlags.Ephemeral,
        },
      }
    } else {
      throw new AppErrors.UnhandledState(`Unexpected outcome type ${outcome_type}`)
    }
  } else {
    // The vote is submitted

    return ctx.defer(async ctx => {
      // 1. Cast the vote
      if (btn_vote.cancel) {
        await app.matches.ongoing.castPlayerVote(app, match, ctx.interaction.member.user.id, { cancel: true })
      } else if (undefined !== btn_vote.wld) {
        await app.matches.ongoing.castPlayerVote(app, match, ctx.interaction.member.user.id, { own_wld: btn_vote.wld })
      } else {
        throw new AppErrors.UnhandledState(`Unknown vote type ${JSON.stringify(btn_vote)}`)
      }

      // 2. Act on the match if it is canceled or finished
      if (match.data.status === MatchStatus.Finished) {
        // Send a message indicating the winner
        const { winning_team_indices, is_draw } = app.matches.getProperties(match)
        const team_players = await match.teams()
        if (is_draw) {
          await ctx.send({ content: `It's a draw!` })
        } else if (winning_team_indices) {
          const winning_teams = winning_team_indices.map(i => team_players[i])
          if (winning_teams.length === 1) {
            // One winning team (most cases)
            const winning_team = winning_teams[0]
            await ctx.send({
              content:
                winning_team.length > 1
                  ? `${listToString(winning_team.map(p => app.players.mentionOrName(p.player)))}'s team won!`
                  : `<@${winning_team[0].player.data.user_id}> won!`,
            })
          } else {
            // Multiple winning teams but not full draw
            await ctx.send({ content: `Multiple teams won!` })
          }
        }
      }

      if (match.data.status === MatchStatus.Finished || match.data.status === MatchStatus.Canceled) {
        const thread_id = match.data.ongoing_match_channel_id
        if (thread_id) await app.discord.editChannel(thread_id, { archived: true })
      }

      await ctx.edit((await ongoingMatchPage(app, ctx.state)).response_data)
    })
  }
}

/**
 * Called when a player clicks "agree" to votes during an ongoing match
 */
export async function agreeToVotes(
  app: App,
  ctx: ComponentContext<typeof ongoing_match_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const match = await app.db.matches.fetch(ctx.state.get.match_id())

    const vote = await app.matches.ongoing.playerAgreeToVotes(app, match, ctx.interaction.member.user.id)
    if (!vote) {
      await ctx.edit({
        content: `Cannot agree, because current match result votes are indecisive.`,
      })
    }

    await ctx.edit((await ongoingMatchPage(app, ctx.state)).response_data)
  })
}

export async function undoVote(
  app: App,
  ctx: ComponentContext<typeof ongoing_match_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const match = await app.db.matches.fetch(ctx.state.get.match_id())
    await app.matches.ongoing.playerRemoveVote(match, ctx.interaction.member.user.id)
    await ctx.edit((await ongoingMatchPage(app, ctx.state)).response_data)
  })
}

export async function rematch(
  app: App,
  ctx: ComponentContext<typeof ongoing_match_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const old_match = await app.db.matches.fetch(ctx.state.get.match_id())
    const team_players = await old_match.teams()

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
      const { guild_ranking } = await app.db.guild_rankings.fetch({
        guild_id: ctx.interaction.guild_id,
        ranking_id: old_match.data.ranking_id,
      })
      const { thread } = await app.matches.ongoing.startWithThread(
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

    await ctx.edit((await ongoingMatchPage(app, ctx.state)).response_data)
  })
}
