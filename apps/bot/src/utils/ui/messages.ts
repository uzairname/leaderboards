import { Guild, Match, PartialGuildRanking, Ranking } from '@repo/db/models'
import { MessageData } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { APIEmbed } from 'discord-api-types/v10'
import { Colors, commandMention, escapeMd, relativeTimestamp } from '.'
import { matches_cmd } from '../../services/matches/ui/matches/matches-cmd'
import { liveLbMsgLink } from '../../services/rankings/properties'
import { create_ranking_cmd } from '../../services/rankings/ui/create-ranking-cmd'
import { setup_cmd } from '../../services/setup-ui/setup-cmd'
import {
  challenge_cmd,
  join_cmd,
  leave_cmd,
  record_match_cmd,
  settings_cmd,
  settle_match_cmd,
  start_match_cmd,
} from '../../setup/all-interaction-handlers'
import { App } from '../../setup/app'

export const concise_description = `This bot hosts leaderboards for your Discord community by tracking ranked matches between players. It has additional features for matchmaking, analytics, moderation, and cross-server rankings.`

export async function guide(app: App, guild?: Guild): Promise<APIEmbed> {
  const guild_id = guild?.data.id ?? '0'
  return {
    title: `Guide`,
    fields: [
      {
        name: `Setup`,
        value:
          `Every player, match, and rating that this bot tracks belongs to a **ranking**.` +
          ` You might want to have a separate ranking for different games or gamemodes.` +
          `` +
          // `\n - ${await commandMention(app, setup_cmd)}: set up the bot in this server.` +
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
        value: `The bot tracks every player's **estimated skill level** (Also known as their rating, elo, score, number of points, etc.) as they play matches. For each ranking, you can choose any of the following rating methods that the bot can use to calculate ratings:
- **Wins - Losses**: The simplest method. Awards one point to a player for winning a game, and takes away one point for losing.
- **TrueSkill2**: Skill ratings are based on the [TrueSkill2](https://en.wikipedia.org/wiki/TrueSkill) algorithm developed my Microsoft. At first, your skill will be uncertain and you will be hidden from the leaderboard. Winning against opponents comparatively better than you will award more points. Playing more games makes your rating more certain, and thus it will change more slowly.
- **Chess Elo**: The classic chess rating system. Winning against an opponent with a higher rating will award more points. Losing against an opponent with a lower rating will take away more points. Comes with a k-factor setting.`,
      },
    ],
    color: Colors.EmbedBackground,
  }
}

/**
 * Returns a field with the ranking title and display channel
 */
export async function guildRankingDescriptionField(
  app: App,
  p_guild_ranking: PartialGuildRanking,
): Promise<D.APIEmbedField> {
  const { ranking } = await p_guild_ranking.fetch()
  const lb_msg_link = await liveLbMsgLink(app, p_guild_ranking)

  return {
    name: escapeMd((await ranking.fetch()).data.name),
    value: lb_msg_link ? `Live leaderboard: ${lb_msg_link}` : `Live leaderboard not displayed anywhere`,
    inline: false,
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

export const someone_joined_queue = async (app: App, ranking: Ranking, guild_id: string): Promise<MessageData> => {
  return new MessageData({
    content: `${await commandMention(app, join_cmd, guild_id)} - Someone has joined the queue for ${escapeMd(ranking.data.name)}`,
  })
}
