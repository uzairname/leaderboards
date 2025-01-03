import * as D from 'discord-api-types/v10'
import { APIEmbed } from 'discord-api-types/v10'
import { Guild, GuildRanking, Match, Ranking } from '../../../../database/models'
import { PartialGuildRanking } from '../../../../database/models/guildrankings'
import { MatchPlayer, MatchStatus, Vote } from '../../../../database/models/matches'
import { MessageData } from '../../../../discord-framework'
import { sentry } from '../../../../logging/sentry'
import { nonNullable } from '../../../../utils/utils'
import { App } from '../../../app/App'
import settings from '../../modules/admin/views/commands/settings'
import { syncGuildRankingLbMessage } from '../../modules/leaderboard/leaderboard-message'
import { syncMatchesChannel } from '../../modules/matches/logging/matches-channel'
import matches from '../../modules/matches/logging/views/matches-cmd'
import record_match from '../../modules/matches/management/views/commands/record-match-cmd'
import settle_match from '../../modules/matches/management/views/commands/settle-match-cmd'
import start_match from '../../modules/matches/management/views/commands/start-match'
import challenge from '../../modules/matches/matchmaking/challenge/challenge-cmd'
import {
  default as joinCmd,
  default as joinqCmd,
} from '../../modules/matches/matchmaking/queue/views/join-cmd'
import { default_best_of } from '../../modules/rankings/manage-rankings'
import create_ranking from '../../modules/rankings/views/commands/create-ranking'
import rankings from '../../modules/rankings/views/commands/rankings-cmd'
import { Colors } from '../constants'
import { commandMention, dateTimestamp, escapeMd, messageLink, relativeTimestamp } from '../strings'

export const concise_description =
  'Tracks skill ratings and matches for any game. Additional utilities for moderation, display, and statistics.'

export async function guide(app: App, guild?: Guild): Promise<APIEmbed> {
  const guild_id = guild?.data.id ?? '0'
  return {
    title: `Guide`,
    fields: [
      {
        name: `Rankings`,
        value:
          `Every player, match, and rating that this bot tracks belongs to a **ranking**.` +
          ` You might want to have a separate ranking for different games or gamemodes.` +
          `` +
          `\n- ${await commandMention(app, create_ranking)}: create one or more rankings.` +
          `\n- ${await commandMention(app, rankings, guild_id)}: view manage all rankings in this server.`,
      },
      {
        name: `Recording Matches`,
        value:
          `There are multiple ways to initiate matches:` +
          `\n- ${await commandMention(app, challenge, guild_id)}: Challenge someone to a 1v1 match.` +
          ` They will have ${app.config.ChallengeTimeoutMs / (1000 * 60)} minutes to accept.` +
          `\n- ${await commandMention(app, start_match, guild_id)}: Admins can start a match between two players.` +
          (record_match.is_dev
            ? ``
            : `\n- ${await commandMention(app, record_match, guild_id)}: Admins can directly record the result of a match that has already been played.`) +
          `\n> -# The \`when\` parameter of the record-match command is a Discord snowflake.` +
          ` This means you can copy and paste the id of any message on Discord, and the bot will record the time that message was sent as the time that match was played.`,
      },
      {
        name: `Managing Matches`,
        value:
          `View or manage matches with the following commands:` +
          `\n- ${await commandMention(app, matches, guild_id)}: View the match history for this server.` +
          `\n  ${await commandMention(app, settle_match)}: Revert or set the outcome of a specific match. The \`match-id\` parameter is optional, and defaults to the last match that the selected player was in.` +
          ` Reverting a match undoes the effect it had on the players' ratings.` +
          `\n> -# Note that changing a match's outcome may also affect the ratings of players who were not in the match, because of the way ratings are calculated.`,
      },
      {
        name: `Admin & Settings`,
        value:
          `- ${await commandMention(app, settings)}: configure the bot's settings for this server.` +
          `\nIn order do anything that requires permissions, such as overriding match results, you either need server admin perms or the` +
          ` ${guild?.data.admin_role_id ? `<@&${guild.data.admin_role_id}> role` : `admin role, which can be configured in settings`}.` +
          `\n> -# Note: You can edit and rename any channel, thread, or role that this bot creates as you like.`,
      },
      {
        name: `Skill Ratings`,
        value:
          `The bot tracks your estimated skill level as you play matches.` +
          ` Winning against opponents comparatively better than you will award more points. Playing more games makes your rating more certain, and thus it will change more slowly.` +
          `\n> -# Skill ratings are based on [TrueSkill](https://en.wikipedia.org/wiki/TrueSkill), (the algorithm developed my Microsoft).` +
          ` It's a Bayesian rating system that models a player's skill and skill certainty as a Gaussian distribution.` +
          ``,
      },
    ],
    color: Colors.EmbedBackground,
  }
}

export async function allGuildRankingsText(
  app: App,
  guild: Guild,
  guild_rankings: GuildRanking[],
): Promise<APIEmbed[]> {
  const title_and_desc =
    guild_rankings.length === 0
      ? {
          title: `Welcome`,
          description:
            `${escapeMd(guild.data.name)} has no rankings set up.` +
            `\nCreate a ranking in order to track ratings and host ranked matches for your server.`,
        }
      : {
          title: `All Rankings`,
          description: `${escapeMd(guild.data.name)} has **${guild_rankings.length}** ranking${guild_rankings.length === 1 ? `` : `s`}, listed below.`,
        }

  const embeds: D.APIEmbed[] = [
    {
      ...title_and_desc,
      fields: await Promise.all(
        guild_rankings.map(async gr => {
          return {
            name: escapeMd((await gr.ranking.fetch()).data.name),
            value: await guildRankingDescription(app, gr),
            inline: false,
          }
        }),
      ),
      color: Colors.Primary,
    },
  ]

  return embeds
}

export async function guildRankingDescription(
  app: App,
  p_guild_ranking: PartialGuildRanking,
  include_details = false,
): Promise<string> {
  sentry.debug(`guildRankingDescription(${p_guild_ranking})`)

  const { guild_ranking, ranking } = await p_guild_ranking.fetch()

  const time_created = ranking.data.time_created
  const teams_per_match = ranking.data.teams_per_match
  const players_per_team = ranking.data.players_per_team

  // Get the match logs channel if it's enabled
  const match_logs_channel_id = guild_ranking.data.display_settings?.log_matches
    ? (await syncMatchesChannel(app, guild_ranking.guild))?.id
    : undefined

  const result = await syncGuildRankingLbMessage(app, guild_ranking, {
    enable_if_disabled: false,
    no_edit: true,
  })

  const message_link = result
    ? messageLink(guild_ranking.data.guild_id, result.channel_id, result.message.id)
    : undefined

  let text =
    `- Match type: **` +
    new Array(teams_per_match).fill(players_per_team).join('v') +
    `**` +
    `\n- ` +
    (message_link ? `Live leaderboard: ${message_link}` : `Leaderboard not displayed anywhere`)

  if (include_details) {
    text +=
      (time_created ? `\n- Created on ${dateTimestamp(time_created)}` : ``) +
      (match_logs_channel_id ? `\n- Matches are logged in <#${match_logs_channel_id}>` : ``) +
      `\n- Matchmaking queue (${await commandMention(app, joinqCmd, guild_ranking.data.guild_id)}): ` +
      (ranking.data.matchmaking_settings.queue_enabled ? `**Enabled**` : `**Disabled**`) +
      `\n- Direct challenges (${await commandMention(app, challenge, guild_ranking.data.guild_id)}): ` +
      (ranking.data.matchmaking_settings.direct_challenge_enabled
        ? `**Enabled**`
        : `**Disabled**`) +
      `\n- By default, new matches are a best of **${ranking.data.matchmaking_settings.default_best_of ?? default_best_of}**`
  }

  return text
}

// Matches
export function ongoingMatch1v1Message(
  app: App,
  match: Match,
  team_players: MatchPlayer[][],
): { content: string; embeds: D.APIEmbed[] } {
  const players = team_players.map(team => team.map(p => p.player)).flat()
  const team_votes = nonNullable(match.data.team_votes, 'match.team_votes')

  function voteToString(user_id: string, vote: Vote) {
    if (vote === Vote.Undecided) {
      return ``
    }

    return (
      `**<@${user_id}> ` +
      {
        [Vote.Win]: 'claims win**',
        [Vote.Loss]: 'claims loss**',
        [Vote.Draw]: 'claims draw**',
        [Vote.Cancel]: 'wants to cancel**',
      }[vote]
    )
  }

  const votes_str = players
    .map((p, i) => voteToString(p.data.user_id, team_votes[i]))
    .filter(Boolean)
    .join(`\n`)

  const best_of = match.data.metadata?.best_of ?? 1

  const embeds: D.APIEmbed[] = []

  embeds.push({
    description:
      `This match is a **best of ${best_of}**.`+
      (best_of > 1
        ? ` Play all games, then report the results below. `
        : ` Play the game, then report the results below`) +
      `\nAn admin can resolve any disputes`, // prettier-ignore
    color: Colors.EmbedBackground,
  })

  if (match.data.status === MatchStatus.Finished || match.data.status === MatchStatus.Canceled) {
    embeds.push({
      description: `Match concluded. Click Rematch in the next ${Math.round(app.config.RematchTimeoutMs / (1000 * 60))} minutes to start another best of ${best_of}`,
      color: Colors.Primary,
    })
  } else if (votes_str) {
    embeds.push({
      description: votes_str + ``,
      color: Colors.EmbedBackground,
    })
  }

  const players_ping_text = team_players
    .map(team => team.map(player => `<@${player.player.data.user_id}>`).join(', '))
    .join(' vs ')

  return {
    content: players_ping_text,
    embeds,
  }
}

export const queue_join = ({
  match,
  already_in,
  ranking,
  expires_at,
}: {
  match?: Match
  already_in: boolean
  ranking: Ranking
  expires_at: Date
}) => {
  return match
    ? `A match has been found!`
    : (already_in ? `You rejoined the queue` : 'You joined the queue') +
        ` for ${escapeMd(ranking.data.name)}.` +
        ` You'll be removed ${relativeTimestamp(expires_at)} if a match isn't found.`
}

export const someone_joined_queue = async (
  app: App,
  ranking: Ranking,
  guild_id: string,
): Promise<MessageData> => {
  return new MessageData({
    content: `${await commandMention(app, joinCmd, guild_id)} - Someone has joined the queue for ${escapeMd(ranking.data.name)}`,
  })
}
