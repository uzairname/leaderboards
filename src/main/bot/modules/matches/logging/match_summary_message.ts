import * as D from 'discord-api-types/v10'
import { and, eq } from 'drizzle-orm'
import { MessageData } from '../../../../../discord-framework'
import { sentry } from '../../../../../logging'
import { maxIndex, nonNullable } from '../../../../../utils/utils'
import { App } from '../../../../context/app_context'
import { GuildRanking, Match } from '../../../../database/models'
import { MatchTeamPlayer } from '../../../../database/models/matches'
import { MatchSummaryMessages } from '../../../../database/schema'
import { Colors } from '../../../common/constants'
import { emojis, escapeMd, relativeTimestamp } from '../../../common/strings'
import { default_elo_settings } from '../../rankings/manage_rankings'
import { syncMatchesChannel } from '../matches_channel'
import { calculateMatchNewRatings } from '../recording/trueskill'

export function addMatchSummaryMessageListeners(app: App): void {
  app.events.MatchCreatedOrUpdated.on(async match => {
    await syncMatchSummaryMessages(app, match)
  })
}

/**
 * Sync match summary messages for this match across all guilds the match's ranking is in
 */
async function syncMatchSummaryMessages(app: App, match: Match): Promise<void> {
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: match.data.ranking_id })

  await Promise.all(
    guild_rankings.map(async item => {
      await syncMatchSummaryMessage(app, match, item.guild_ranking)
    }),
  )
}

/**
 * Updates the match's summary message, according to the guild ranking's settings
 */
async function syncMatchSummaryMessage(
  app: App,
  match: Match,
  guild_ranking: GuildRanking,
): Promise<void> {
  // Check whether match logging is enabled for this guild ranking
  if (!guild_ranking.data.display_settings?.log_matches) return

  const guild = await guild_ranking.guild

  const match_logs_channel = await syncMatchesChannel(app, guild)

  const existing_message = await match.getSummaryMessage(guild_ranking.data.guild_id)
  sentry.debug(`existing message: ${existing_message}`)

  const sync_message_result = await app.bot.utils.syncChannelMessage({
    target_channel_id: match_logs_channel.id,
    target_message_id: existing_message?.message_id,
    messageData: await matchSummaryMessageData(app, match),
  })

  if (sync_message_result.is_new_message) {
    if (existing_message) {
      await app.db.db
        .update(MatchSummaryMessages)
        .set({
          message_id: sync_message_result.message.id,
        })
        .where(
          and(
            eq(MatchSummaryMessages.match_id, match.data.id),
            eq(MatchSummaryMessages.guild_id, guild_ranking.data.guild_id),
          ),
        )
    } else {
      await app.db.db.insert(MatchSummaryMessages).values({
        match_id: match.data.id,
        guild_id: guild_ranking.data.guild_id,
        message_id: sync_message_result.message.id,
      })
    }
  }
}

export async function matchSummaryMessageData(app: App, match: Match): Promise<MessageData> {
  return new MessageData({
    embeds: [
      await matchSummaryEmbed(app, match, await match.teamPlayers(), {
        ranking_name: true,
        id: true,
        time_finished: true,
      }),
    ],
  })
}

export async function matchSummaryEmbed(
  app: App,
  match: Match,
  team_players: MatchTeamPlayer[][],
  options?: {
    ranking_name?: boolean
    id?: boolean
    time_finished?: boolean
    include_outcome_num?: boolean
  },
): Promise<D.APIEmbed> {
  const ranking = await match.ranking()
  const new_ratings = calculateMatchNewRatings(
    match,
    team_players,
    ranking.data.elo_settings ?? default_elo_settings,
  )

  let details: string = options?.id ? `-# id: \`${match.data.id}\`` : ''

  const time_finished_str =
    options?.time_finished && match.data.time_finished
      ? `${relativeTimestamp(match.data.time_finished)}`
      : ``

  const winning_team_index = maxIndex(match.data.outcome ?? [])
  const is_draw = winning_team_index === -1

  const embed = {
    title: (options?.ranking_name ? `${escapeMd(ranking.data.name)} ` : '') 
      + `Match ${match.data.number}`
      // If details only contains the time finished, put it in the title 
      // of the embed instead of a separate field.
      + (time_finished_str 
        ? (details
          ? (() => {
              if (time_finished_str) details = `Finished ${time_finished_str}\n` + details; return ``
            })()
          : ` - ${time_finished_str}`) 
        : ``)
      ,
    fields: [team_players.map((team, team_num) => {
      const team_outcome = `${nonNullable(match.data.outcome, 'match outcome')[team_num]}`
      return {
        name:
          (is_draw 
            ? emojis.light_circle + (options?.include_outcome_num ? team_outcome : `Draw`)
            : (team_num === winning_team_index 
              ? emojis.green_triangle + (options?.include_outcome_num ? team_outcome : `Win`)
              : emojis.red_triangle + (options?.include_outcome_num ? team_outcome : `Loss`)
            )
          ),
        value: team
          .map((player, player_num) => {
            const rating_after_text =
              new_ratings[team_num][player_num].new_rating.toFixed(0)
            const diff =
              new_ratings[team_num][player_num].new_rating -
              player.rating_before
            const diff_text = (parseInt(diff.toFixed(0)) > 0 ? '+' : '') + diff.toFixed(0)
            return `<@${player.player.data.user_id}> ${rating_after_text} *(${diff_text})*`
          })
          .join('\n'),
        inline: true
      }
    }), details ? [{
      name: `Details`,
      value: details,
    }] : []].flat(),
    color: Colors.EmbedBackground,
  } // prettier-ignore

  return embed
}
