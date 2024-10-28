import { APIEmbed } from 'discord-api-types/v10'
import { nonNullable } from '../../../utils/utils'
import { App } from '../../app/App'
import type { Guild, Match, Player } from '../../../database/models'
import { Vote } from '../../../database/models/matches'
import settings from '../modules/admin/views/commands/settings'
import matches from '../modules/matches/logging/views/commands/matches'
import record_match from '../modules/matches/management/views/commands/record_match'
import start_match from '../modules/matches/management/views/commands/start_match'
import challenge from '../modules/matches/matchmaking/views/commands/challenge'
import create_ranking from '../modules/rankings/views/commands/create_ranking'
import rankings from '../modules/rankings/views/commands/rankings'
import { Colors } from './constants'
import { commandMention } from './strings'

export namespace AppMessages {
  export const concise_description =
    'Tracks Elo ratings and matches for any game. Additional utilities for moderation, display, and statistics.'

  export async function howtouse(app: App, guild?: Guild): Promise<APIEmbed> {
    const guild_id = guild?.data.id ?? '0'
    return {
      title: `How to Use`,
      fields: [
        {
          name: `Rankings`,
          value:
            `Every player, match, and elo rating that this bot tracks belongs to a **ranking**. ` +
            `A ranking usually denotes a game or a gamemode.` +
            `\nType the following commands to get started:` +
            `\n- ${await commandMention(app, create_ranking)}: create one or more rankings.` +
            `\n- ${await commandMention(app, rankings, guild_id)} to view manage all rankings in this server.`,
        },
        {
          name: `Admin & Settings`,
          value:
            `- ${await commandMention(app, settings)}: configure the bot's settings for this server.` +
            `\nIn order do anything that requires permissions, such as overriding match results, you either need server admin perms or the ` +
            `${guild?.data.admin_role_id ? `<@&${guild.data.admin_role_id}> role` : `admin role, which can be configured in settings`}.` +
            `\n> -# Note: You can edit and rename any channel, thread, or role that this bot creates as you like.`,
        },
        {
          name: `Elo Ratings`,
          value:
            `The bot tracks your estimated skill levels as you play matches.` +
            `\nWinning against opponents comparatively better than you will award more points. Once you've played more games, the algorithm is more certain about your skill, and your rating is more stable.` +
            `\n> -# The Elo system is based on [TrueSkill](https://en.wikipedia.org/wiki/TrueSkill), (the algorithm developed my Microsoft). ` +
            `It's a Bayesian rating system that models a player's skill as a Gaussian distribution and updates it based on a likelihood function. ` +
            `Expect to play about 10 games before your rating stabilizes.`,
        },
        {
          name: `Starting and Logging Matches`,
          value:
            `There are several ways to initiate matches:` +
            `\n- ${await commandMention(app, challenge, guild_id)}: Challenge someone to a 1v1 match. ` +
            `The challenged player has ${app.config.ChallengeTimeoutMs / (1000 * 60)} minutes to accept.` +
            `\n- ${await commandMention(app, start_match, guild_id)}: Admins can start a match between two players.` +
            (record_match.is_dev
              ? ``
              : `\n- ${await commandMention(app, record_match, guild_id)}: Admins can directly record the result of a match that has already been played. `) +
            `\n> -# The \`when\` parameter of the record-match command is a Discord snowflake. ` +
            `This means you can copy and paste the id of any message on Discord, and the bot will use the time that message was sent as the time of the match.`,
        },
        {
          name: `Managing Matches`,
          value:
            `View or manage matches with the following commands:` +
            `\n- ${await commandMention(app, matches, guild_id)} \`id\`: View the match history for this server. ` +
            `\nEnter a match id to view a specific match. Admins can change a match's outcome or revert it. ` +
            `Reverting a match undoes the effect it had on the players' ratings. ` +
            `\n> -# Note that changing a match's outcome may also affect the ratings of players who were not in the match, because of the way Elo is calculated.`,
        },
      ],
      color: Colors.EmbedBackground,
    }
  }

  export const no_rankings_description = `This server has no rankings. Create one to host ranked matches and leaderboards for any game.`

  export function ongoingMatch1v1Message(match: Match, players: Player[]): string {
    const team_votes = nonNullable(match.data.team_votes, 'match.team_votes')

    function voteToString(user_id: string, vote: Vote) {
      if (vote === Vote.Undecided) {
        return ``
      }

      return (
        `<@${user_id}> ` +
        {
          [Vote.Win]: 'claims win',
          [Vote.Loss]: 'claims loss',
          [Vote.Draw]: 'claims draw',
        }[vote]
      )
    }

    const votes_str = players
      .map((p, i) => voteToString(p.data.user_id, team_votes[i]))
      .filter(Boolean)
      .join(`\n`)

    const best_of = match.data.metadata?.best_of ?? 1

    return (
      `${players.map(p => `<@${p.data.user_id}>`).join(``)}` +
      `\n` +
      (best_of > 1
        ? `This match is a **best of ${best_of}**. Play all games, then report the results below. `
        : `Play a game, then report the results below`) +
      `\nAn admin can resolve any disputes` +
      `\n${votes_str}`
    )
  }
}
