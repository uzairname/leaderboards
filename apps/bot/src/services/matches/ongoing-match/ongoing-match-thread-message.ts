import * as D from 'discord-api-types/v10'

import { Match, MatchPlayer, MatchStatus, WLDVote } from '@repo/db/models'
import { listToString, nonNullable } from '@repo/utils'
import { App } from '../../../setup/app'
import { Colors } from '../../utils/strings'

// Matches
export async function ongoingMatchThreadMessage(
  app: App,
  match: Match,
  players: MatchPlayer[][],
): Promise<{ content: string; embeds: D.APIEmbed[] }> {
  const team_votes = nonNullable(match.data.team_votes, 'match.team_votes')

  const player_votes_str = players
    .map((team, i) => {
      const vote = team_votes[i]

      const vote_string = (() => {
        if (vote.cancel) {
          return `wants to cancel`
        }
        switch (vote.own_wld) {
          case WLDVote.Win:
            return `claims win`
          case WLDVote.Loss:
            return `claims loss`
          case WLDVote.Draw:
            return `claims draw`
          default:
            break
        }
        if (undefined !== vote.outcome) {
          return `has voted`
        }
        return undefined
      })()
      if (undefined === vote_string) return undefined

      const team_name = team.length === 1 ? `${app.players.mentionOrName(team[0].player)}` : `Team ${i + 1}`

      return `${team_name} ${vote_string}`
    })
    .filter(Boolean)
    .join(`\n`)

  const embeds: D.APIEmbed[] = []

  // Best of and overview
  embeds.push({
    description: `Play the match according to the agreed upon rules, then report the results below by voting for the match's outcome. ` +
     `Once all players agree on the result, the match will be scored` +
      `\nAn admin can resolve any disputes`, // prettier-ignore
    color: Colors.EmbedBackground,
  })

  // Votes and match concluded text
  if (match.data.status === MatchStatus.Finished || match.data.status === MatchStatus.Canceled) {
    embeds.push({
      description: `Match concluded. To start another match, both players must agree to rematch within ${Math.round(app.config.RematchTimeoutMinutes)} minutes.`,
      color: Colors.Primary,
    })
  } else if (player_votes_str) {
    embeds.push({
      description: player_votes_str + ``,
      color: Colors.EmbedBackground,
    })
  }

  const players_ping_text = players
    .map(team => listToString(team.map(p => app.players.mentionOrName(p.player))))
    .join(' vs ')

  return {
    content: players_ping_text,
    embeds,
  }
}
