import * as D from 'discord-api-types/v10'

import { Match, MatchPlayer, MatchStatus, Player, Vote } from '@repo/db/models'
import { nonNullable } from '@repo/utils'
import { App } from '../../../setup/app'
import { Colors } from '../../../utils'
import { mentionOrName } from '../../players/properties'
import { rankingProperties } from '../../rankings/properties'

/**
 * Determine the custom description to display at the top of the match thread,
 * based on the configuration in its ranking.
 *
 * If custom_desc_config is not set, returns undefined
 * If any key of custom_desc_config is set, returns a string satisfying that key's rule.
 *
 * Assumes match is ffa (1v1v1v...), and players is the flattened array of teams.
 */
export async function generateCustomMatchDesc(match: Match, players: MatchPlayer[]): Promise<string | undefined> {
  const ranking = await match.ranking.fetch()

  const custom_desc_config = ranking.data.match_settings?.custom_desc

  if (custom_desc_config?.random_items_each_team_choices) {
    // Choose a random item for the match, then choose a random item depending on the first item, one for each team.
    const match_item_options = Object.keys(custom_desc_config.random_items_each_team_choices)

    const match_item = match_item_options[Math.floor(Math.random() * match_item_options.length)]

    const player_items_choices = custom_desc_config.random_items_each_team_choices[match_item]

    // choose a random item for each team
    const player_items = players.map(p => {
      return player_items_choices[Math.floor(Math.random() * player_items_choices.length)]
    })

    return (
      `**${match_item}**` +
      `\n${player_items.map((item, i) => `<@${players[i].player.data.user_id}>: **${item}**`).join('\n')}`
    )
  }
}

// Matches

export async function ongoingMatch1v1Message(
  app: App,
  match: Match,
  players: MatchPlayer[],
): Promise<{ content: string; embeds: D.APIEmbed[] }> {
  const ranking = await match.ranking.fetch()
  const team_votes = nonNullable(match.data.team_votes, 'match.team_votes')

  function voteToString(player: Player, vote: Vote) {
    if (vote === Vote.Undecided) {
      return ``
    }

    return (
      mentionOrName(player) +
      {
        [Vote.Win]: 'claims win**',
        [Vote.Loss]: 'claims loss**',
        [Vote.Draw]: 'claims draw**',
        [Vote.Cancel]: 'wants to cancel**',
      }[vote]
    )
  }

  const votes_str = players
    .map((p, i) => voteToString(p.player, team_votes[i]))
    .filter(Boolean)
    .join(`\n`)

  const best_of = match.data.metadata?.best_of ?? 1

  const embeds: D.APIEmbed[] = []

  let description = ``

  if (rankingProperties(ranking).tracks_best_of) {
    description += `This match is a **best of ${best_of}**.\n`
  }

  // Best of and overview
  embeds.push({
    description: (best_of > 1
        ? ` Play all games, then report the results below. `
        : ` Play the game, then report the results below`) +
      `\nAn admin can resolve any disputes`, // prettier-ignore
    color: Colors.EmbedBackground,
  })

  // Votes and match concluded text
  if (match.data.status === MatchStatus.Finished || match.data.status === MatchStatus.Canceled) {
    embeds.push({
      description: `Match concluded. To start another best of ${best_of}, both players must agree to rematch within ${Math.round(app.config.RematchTimeoutMinutes)} minutes.`,
      color: Colors.Primary,
    })
  } else if (votes_str) {
    embeds.push({
      description: votes_str + ``,
      color: Colors.EmbedBackground,
    })
  }

  const players_ping_text = players.map(player => `<@${player.player.data.user_id}>`).join(' vs ')

  return {
    content: players_ping_text,
    embeds,
  }
}
