import { Match, MatchOutcome, OutcomeType, PartialGuildRanking, Player, Vote, WLDVote } from '@repo/db/models'
import { arraysEqual, listToString, nonNullable, truncateString } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { UserError } from '../../../errors/user-errors'
import { ongoingMatchPage, ongoing_match_view_sig } from '../../../interactions/ongoing-match/view'
import { App } from '../../../setup/app'
import { AppService, LogMethods } from '../../service'
import { Colors } from '../../utils/strings'

/**
 * Manages ongoing matches in a guild, and their voting process
 */
@LogMethods
export class OngoingMatchService extends AppService {
  /**
   * Starts a new 1v1 match in a guild. Syncs the match's summary message
   * and creates a thread under it to manage the ongoing match.
   */
  async startWithThread(
    app: App,
    guild_ranking: PartialGuildRanking,
    players: Player[][],
    best_of?: number,
  ): Promise<{ match: Match; thread: D.APIChannel }> {
    const { guild, ranking } = await guild_ranking.fetch()

    const match = await app.matches.start(app, ranking, players, best_of)

    const match_message = await app.matches.syncMatchSummaryMessage(app, match, guild)

    const thread_name = players.slice(0, 10)
      .map(team => truncateString(listToString(team.map(p => p.data.name)), Math.floor(95 / players.length)))
      .join(' vs ')

    const thread = await app.discord.createPublicThread(
      {
        name: thread_name,
        auto_archive_duration: D.ThreadAutoArchiveDuration.OneHour,
        invitable: true,
      },
      match_message.channel_id,
      match_message.id,
    )

    await Promise.all([
      match.update({ ongoing_match_channel_id: thread.id }),
      app.discord
        .createMessage(
          thread.id,
          (
            await ongoingMatchPage(
              app,
              ongoing_match_view_sig.newState({
                match_id: match.data.id,
              }),
            )
          ).post_data,
        )
        .then(message => {
          app.discord.pinMessage(thread.id, message.id)
        }),
    ])

    // One-time message at the start of a match in the thread
    const custom_match_desc = undefined
    if (custom_match_desc) {
      await app.discord.createMessage(thread.id, {
        embeds: [
          {
            description: custom_match_desc,
            color: Colors.EmbedBackground,
          },
        ],
      })
    }

    return { match, thread }
  }

  /**
   * Cast a vote for a match
   */
  async castPlayerVote(app: App, match: Match, voting_user_id: string, vote: Vote): Promise<void> {
    const team_players = await match.teams()

    // Checks: ensure the user is in the match
    const team_index = team_players.findIndex(team => team.some(p => p.player.data.user_id === voting_user_id))
    if (team_index == -1) throw new UserError(`You aren't participating in this match`) // TODO: implement auth at interaction level

    // Update the vote for the team
    const current_team_votes = match.data.team_votes ?? {}
    const new_team_votes = {
      ...current_team_votes,
      [team_index]: vote,
    }

    await match.update({ team_votes: new_team_votes })

    // Act on voting results if applicable
    await this.scoreMatchByVotes(app, match)
  }

  /**
   * Lets a player agree to the current votes on a match, update the player's vote.
   * If that is not possible, returns undefined
   */
  async playerAgreeToVotes(app: App, match: Match, voting_user_id: string, agree_to_team_idx: number): Promise<Vote | undefined> {
    const team_players = await match.teams()
    const num_teams = team_players.length

    // Check if user is in the match
    const team_index = team_players.findIndex(team => team.some(p => p.player.data.user_id === voting_user_id))
    if (team_index === -1) throw new UserError(`You aren't participating in this match`)

    // Check if votes are currently unanimous (not necessarily all voted), and each player has voted with almost decisive votes
    const votes = match.data.team_votes
    if (votes === null) {
      return undefined
    }

    const player_new_vote = (() => {
      const vote_to_agree_to = votes[agree_to_team_idx]

      // If they voted for whether they won/lost/drew, agree to that
      if (vote_to_agree_to.own_wld) {
        const new_vote = { [WLDVote.Win]: WLDVote.Loss,
          [WLDVote.Loss]: WLDVote.Win,
          [WLDVote.Draw]: WLDVote.Draw,
         }[vote_to_agree_to.own_wld]
         if (new_vote !== undefined) return {
          own_wld: new_vote,
         }
      }

      // Otherwise, match the vote
      return vote_to_agree_to
    })()

    await this.castPlayerVote(app, match, voting_user_id, player_new_vote)
  }

  async playerRemoveVote(match: Match, user_id: string) {
    const team_players = await match.teams()

    // Checks: ensure the user is in the match
    const team_index = team_players.findIndex(team => team.some(p => p.player.data.user_id === user_id))
    if (team_index == -1) throw new UserError(`You aren't participating in this match`) // TODO: implement auth at interaction level

    // Remove the vote for the team
    const current_team_votes = match.data.team_votes ?? {}
    delete current_team_votes[team_index]
    const new_team_votes = { ...current_team_votes }

    await match.update({ team_votes: new_team_votes })
  }

  /**
   * Attempts to score a match based on the votes cast by the teams.
   * If the votes are indecisive, returns undefined. Otherwise, scores the match
   * and returns the updated match
   */
  async scoreMatchByVotes(app: App, match: Match) {
    const team_players = await match.teams()
    const num_teams = team_players.length

    const votes = match.data.team_votes
    if (!votes) return undefined

    const everyone_voted = Object.keys(votes).length === num_teams
    if (!everyone_voted) return undefined

    // If all votes are cancel, revert the match
    const unanimous_cancel = everyone_voted && Object.values(votes).every(v => v.cancel)
    if (unanimous_cancel) {
      return await app.matches.cancel(app, match, 'vote')
    }

    const outcome: MatchOutcome | undefined = (() => {
      // 1. Determine whether we can score the match based on everyone's "own_wld" submission
      const own_wld_outcome: MatchOutcome | undefined = (() => {
        const all_teams_voted_wld = Object.values(votes).every(v => v.own_wld)
        if (!all_teams_voted_wld) return undefined

        // Everyone agrees on one winner. All votes are win/loss, and only one team votes for a win.
        const agree_on_winner =
          Object.values(votes).every(v => v.own_wld === WLDVote.Win || v.own_wld === WLDVote.Loss) &&
          Object.values(votes).filter(v => v.own_wld === WLDVote.Win).length === 1

        // All votes are for a draw
        const agree_on_draw = Object.values(votes).every(v => v.own_wld === WLDVote.Draw)

        if (agree_on_winner || agree_on_draw) {
          const team_scores = team_players.map((_, team_num) => {
            const v = votes[team_num]
            const own_wld_vote = nonNullable(v.own_wld, 'vote.own_wld on unanimous vote')
            return {
              [WLDVote.Win]: 1,
              [WLDVote.Loss]: 0,
              [WLDVote.Draw]: 0.5,
            }[own_wld_vote]
          })

          return {
            type: OutcomeType.WinLossDraw,
            team_scores,
          }
        }
      })()
      if (own_wld_outcome) return own_wld_outcome

      // 2. Determine whether we can score the match based on everyone's "outcome" submission

      const unanimous_outcome: MatchOutcome | undefined = (() => {
        // If all votes have the same ranks, we can score the match.
        const first_team_type = Object.values(votes)[0].outcome?.type
        if (!first_team_type) return undefined

        const all_teams_voted_same_type = Object.values(votes).every(v => v.outcome?.type === first_team_type)
        if (!all_teams_voted_same_type) return undefined

        const first_team_vote_team_scores = Object.values(votes)[0].outcome?.team_scores
        if (!first_team_vote_team_scores) return undefined
        const agree_on_ranks = Object.values(votes).every(
          v => v.outcome?.team_scores && arraysEqual(v.outcome.team_scores, first_team_vote_team_scores),
        )
        if (!agree_on_ranks) return undefined

        return {
          type: OutcomeType.Ranks,
          team_scores: first_team_vote_team_scores,
        }
      })()

      if (unanimous_outcome) return unanimous_outcome
    })()

    if (outcome) {
      return await app.matches.setOutcome(app, match, 'vote', outcome)
    }
  }
}
