import { Guild, GuildRanking, Match, PartialGuildRanking, Ranking } from '@repo/db/models'
import { MessageData } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { APIEmbed } from 'discord-api-types/v10'
import { Colors, commandMention, dateTimestamp, escapeMd, messageLink, relativeTimestamp } from '.'
import { sentry } from '../../logging/sentry'
import { setup_cmd } from '../../services/admin/setup-cmd'
import { syncGuildRankingLbMessage } from '../../services/leaderboard/leaderboard-message'
import { syncMatchesChannel } from '../../services/matches/logging/matches-channel'
import { matches_cmd } from '../../services/matches/logging/views/matches-cmd'
import { default_matchmaking_settings } from '../../services/rankings/ranking-properties'
import { create_ranking_cmd } from '../../services/rankings/views/commands/create-ranking-cmd'
import { App } from '../../setup/app'
import {
  challenge_cmd,
  help_cmd,
  join_cmd,
  leave_cmd,
  record_match_cmd,
  settings_cmd,
  settle_match_cmd,
  start_match_cmd,
} from '../../setup/views'

export const concise_description = `This bot manages competitive leaderboards for any game by coordinating and tracking ranked matches between players in your community. It has additional features for matchmaking, analytics, customization, and moderation.`

export async function guide(app: App, guild?: Guild): Promise<APIEmbed> {
  const guild_id = guild?.data.id ?? '0'
  return {
    title: `Guide`,
    fields: [
      {
        name: `Overview`,
        value:
          `Every player, match, and rating that this bot tracks belongs to a **ranking**.` +
          ` You might want to have a separate ranking for different games or gamemodes.` +
          `` +
          `\n - ${await commandMention(app, setup_cmd)}: set up the bot in this server.` +
          `\n- ${await commandMention(app, create_ranking_cmd)} \`name\`: create one or more rankings.` +
          `\n- ${await commandMention(app, settings_cmd, guild_id)} \`ranking\`: manage rankings in this server. Enter a specific ranking to view or manage it.`,
      },
      {
        name: `Recording Matches`,
        value:
          `There are multiple ways to initiate matches.` +
          `\n- ${await commandMention(app, challenge_cmd, guild_id)} \`opponent\`: Challenge someone to a 1v1 match.` +
          ` They will have ${app.config.ChallengeTimeoutMs / (1000 * 60)} minutes to accept.` +
          `\n- ${await commandMention(app, start_match_cmd, guild_id)}: Admins can start a match between two players.` +
          (record_match_cmd.signature.config.experimental
            ? ``
            : `\n- ${await commandMention(app, record_match_cmd, guild_id)}: Admins can directly record the result of a match that has already been played.`) +
          `\n- ${await commandMention(app, join_cmd, guild_id)}: If the queue is enabled, you can join the queue for a ranking. Once enough players join the queue, matches are automatically created based on estimated skill. Enter ${await commandMention(app, leave_cmd)} to leave all queues you are in.` +
          `Once a match is initiated, the bot creates a channel where players can record the match's result, and rematch if they want.` +
          // `\n> -# The \`when\` parameter of the record-match command is a Discord snowflake.` +
          // ` This means you can copy and paste the id of any message on Discord, and the bot will record the time that message was sent as the time that match was played.`
          ``,
      },
      {
        name: `Managing Matches`,
        value:
          `View or manage matches with the following commands:` +
          `\n- ${await commandMention(app, matches_cmd, guild_id)} \`player\`: View the match history for this server.` +
          `\n  ${await commandMention(app, settle_match_cmd)}: Revert or set the outcome of a specific match. The \`match-id\` parameter is optional, and defaults to the last match that the selected player was in.` +
          ` Reverting a match undoes the effect it had on the players' ratings.` +
          `\n> -# Note: changing the outcome of an old match may have a cascading effect on the ratings of players who were in subsequent matches, because of the way ratings are calculated.`,
      },
      {
        name: `Admin & Settings`,
        value:
          `In order do anything that requires permissions, such as overriding match results, you either need server admin perms or the` +
          ` ${guild?.data.admin_role_id ? `<@&${guild.data.admin_role_id}> role` : `admin role, which can be configured using /setup`}. `,
      },
      {
        name: `Player Ratings`,
        value: `The bot tracks every player's **estimated skill level** (Also known as their rating, elo, score, number of points, etc.) as they play matches. For each ranking, you can choose any of the following scoring methods that the bot can use to calculate ratings:
- **Wins - Losses**: The simplest method. Awards one point to a player for winning a game, and takes away one point for losing.
- **TrueSkill2**: Skill ratings are based on the [TrueSkill2](https://en.wikipedia.org/wiki/TrueSkill) algorithm developed my Microsoft. At first, your skill will be uncertain and you will be hidden from the leaderboard. Winning against opponents comparatively better than you will award more points. Playing more games makes your rating more certain, and thus it will change more slowly.
- **Chess Elo**: The classic chess rating system. Winning against an opponent with a higher rating will award more points. Losing against an opponent with a lower rating will take away more points. Comes with a k-factor setting.`,
      },
    ],
    color: Colors.EmbedBackground,
  }
}

export async function allRankingsPageEmbeds(
  app: App,
  guild: Guild,
  guild_rankings: GuildRanking[],
): Promise<APIEmbed[]> {
  const rankings_embed_title_and_desc =
    guild_rankings.length === 0
      ? {
          title: `Create a Ranking`,
          description: `${escapeMd(guild.data.name)} has no rankings set up.

For more info, use ${await commandMention(app, help_cmd)}`,
        }
      : {
          title: `All Rankings`,
          description: `${escapeMd(guild.data.name)} has **${guild_rankings.length}** ranking${guild_rankings.length === 1 ? `` : `s`}. Adjust their settings by selecting a ranking below.`,
        }

  const embeds: D.APIEmbed[] = [
    {
      ...rankings_embed_title_and_desc,
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
      `\n- Matchmaking queue (${await commandMention(app, join_cmd, guild_ranking.data.guild_id)}): ` +
      (ranking.data.matchmaking_settings.queue_enabled ? `**Enabled**` : `**Disabled**`) +
      `\n- Direct challenges (${await commandMention(app, challenge_cmd, guild_ranking.data.guild_id)}): ` +
      (ranking.data.matchmaking_settings.direct_challenge_enabled ? `**Enabled**` : `**Disabled**`) +
      `\n- By default, new matches are a best of **${ranking.data.matchmaking_settings.default_best_of ?? default_matchmaking_settings.default_best_of}**`
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

export const someone_joined_queue = async (app: App, ranking: Ranking, guild_id: string): Promise<MessageData> => {
  return new MessageData({
    content: `${await commandMention(app, join_cmd, guild_id)} - Someone has joined the queue for ${escapeMd(ranking.data.name)}`,
  })
}
