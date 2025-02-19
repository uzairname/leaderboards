import { Guild, GuildRanking, Match, Ranking } from 'database/models'
import { PartialGuildRanking } from 'database/models/guildrankings'
import * as D from 'discord-api-types/v10'
import { APIEmbed } from 'discord-api-types/v10'
import { MessageData } from 'discord-framework'
import { sentry } from '../../../logging/sentry'
import settings from '../../services/admin/views/commands/settings-cmd'
import { syncGuildRankingLbMessage } from '../../services/leaderboard/leaderboard-message'
import { syncMatchesChannel } from '../../services/matches/logging/matches-channel'
import matches from '../../services/matches/logging/views/matches-cmd'
import record_match from '../../services/matches/management/views/commands/record-match-cmd'
import settle_match from '../../services/matches/management/views/commands/settle-match-cmd'
import start_match from '../../services/matches/management/views/commands/start-match-cmd'
import challenge from '../../services/matches/matchmaking/challenge/challenge-cmd'
import {
  default as joinCmd,
  default as joinqCmd,
} from '../../services/matches/matchmaking/queue/views/join-cmd'
import leaveCmd from '../../services/matches/matchmaking/queue/views/leave-cmd'
import { default_best_of } from '../../services/rankings/manage-rankings'
import create_ranking from '../../services/rankings/views/commands/create-ranking-cmd'
import rankings from '../../services/rankings/views/commands/rankings-cmd'
import { App } from '../../setup/app'
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
          `There are multiple ways to initiate matches.` +
          `\n- ${await commandMention(app, challenge, guild_id)}: Challenge someone to a 1v1 match.` +
          ` They will have ${app.config.ChallengeTimeoutMs / (1000 * 60)} minutes to accept.` +
          `\n- ${await commandMention(app, start_match, guild_id)}: Admins can start a match between two players.` +
          (record_match.is_dev
            ? ``
            : `\n- ${await commandMention(app, record_match, guild_id)}: Admins can directly record the result of a match that has already been played.`) +
          `\n- ${await commandMention(app, joinqCmd, guild_id)}: If the queue is enabled, you can join the queue for a ranking. Once enough players join the queue, matches are automatically created based on estimated skill. Enter ${await commandMention(app, leaveCmd)} to leave all queues you are in.` +
          `Once a match is initiated, the bot creates a channel where players can record the match's result, and rematch if they want.` +
          // `\n> -# The \`when\` parameter of the record-match command is a Discord snowflake.` +
          // ` This means you can copy and paste the id of any message on Discord, and the bot will record the time that message was sent as the time that match was played.`
          ``,
      },
      {
        name: `Managing Matches`,
        value:
          `View or manage matches with the following commands:` +
          `\n- ${await commandMention(app, matches, guild_id)}: View the match history for this server.` +
          `\n  ${await commandMention(app, settle_match)}: Revert or set the outcome of a specific match. The \`match-id\` parameter is optional, and defaults to the last match that the selected player was in.` +
          ` Reverting a match undoes the effect it had on the players' ratings.` +
          `\n> -# Note: changing the outcome of an old match may have a cascading effect on the ratings of players who were in subsequent matches, because of the way ratings are calculated.`,
      },
      {
        name: `Admin & Settings`,
        value:
          `In order do anything that requires permissions, such as overriding match results, you either need server admin perms or the` +
          ` ${guild?.data.admin_role_id ? `<@&${guild.data.admin_role_id}> role` : `admin role, which can be configured in settings`}. ` +
          `\n- ${await commandMention(app, settings)}: configure the bot's settings for this server.` +
          `\n> -# Note: You can edit and rename any channel, thread, or role that this bot creates as you like.`,
      },
      {
        name: `Skill Ratings`,
        value:
          `The bot tracks your **estimated skill level** as you play matches. At first, your skill will be uncertain and you will be hidden from the leaderboard.` +
          ` Winning against opponents comparatively better than you will award more points. Playing more games makes your rating more certain, and thus it will change more slowly. Skill ratings are currently based on the [TrueSkill2](https://en.wikipedia.org/wiki/TrueSkill) algorithm developed my Microsoft but I'm down for suggestions.` +
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
