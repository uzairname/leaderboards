import { nonNullable } from '../../../utils/utils'
import type { Match, Player } from '../../database/models'
import { Vote } from '../../database/models/matches'

export namespace AppMessages {
  export const concise_description =
    'Tracks Elo ratings and matches for any game. Additional utilities for moderation, display, and statistics.'

  export const no_rankings_description = `This server has no rankings. Create one to host ranked matches and leaderboards for any game.`

  export function ongoingMatch1v1Message(match: Match, players: Player[]): string {
    const team_votes = nonNullable(match.data.team_votes, 'match.team_votes')

    function voteToString(user_id: string, vote: Vote) {
      if (vote === Vote.Undecided) {
        return ``
      }

      return `<@${user_id}> ` + {
        [Vote.Win]: 'claims win',
        [Vote.Loss]: 'claims loss',
        [Vote.Draw]: 'claims draw',
      }[vote]
    }

    const votes_str = players.map((p, i) => voteToString(p.data.user_id, team_votes[i])).join('\n')

    return (
      `## Match in progress: ${players.map(p => `<@${p.data.user_id}>`).join(' vs ')}` +
      `\n**Votes**:` +
      `\n${votes_str}`
    )
  }
}
