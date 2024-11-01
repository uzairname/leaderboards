import { Match } from '../../../../../database/models'
import { MatchStatus, Vote } from '../../../../../database/models/matches'
import { sentry } from '../../../../../logging/sentry'
import { App } from '../../../../app/App'
import { UserError } from '../../../errors/UserError'
import { cancelMatch } from '../management/manage-matches'
import { finishAndScoreMatch } from '../management/score-matches'

/**
 * Cast a win, loss, draw, or cancel vote for a match
 */
export async function castPlayerVote(
  app: App,
  match: Match,
  voting_user_id: string,
  vote: Vote,
): Promise<void> {
  const team_players = await match.teamPlayers()

  // ensure the user is in the match
  const team_index = team_players.findIndex(team =>
    team.some(p => p.player.data.user_id === voting_user_id),
  )
  if (team_index == -1) throw new UserError(`You aren't participating in this match`)

  // update the vote
  const team_votes = match.data.team_votes ?? team_players.map(_ => Vote.Undecided)
  team_votes[team_index] = team_votes[team_index] === vote ? Vote.Undecided : vote
  await match.update({ team_votes: team_votes })

  // act on voting results

  // if all votes are cancel, revert the match
  const all_cancel_votes = team_votes.every(v => v === Vote.Cancel)
  if (all_cancel_votes) {
    await cancelMatch(app, match)
  }

  const unanimous_win =
    team_votes.every(v => v !== Vote.Undecided) &&
    team_votes.filter(v => v === Vote.Win).length === 1

  const unanimous_outcome = unanimous_win

  if (unanimous_outcome && match.data.status === MatchStatus.Ongoing) {
    const outcome = team_votes.map(v => (v === Vote.Win ? 1 : 0))
    sentry.debug('scoring match')
    await finishAndScoreMatch(app, match, outcome)
  }
}
