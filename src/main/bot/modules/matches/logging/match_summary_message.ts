import * as D from 'discord-api-types/v10'
import { MessageData } from '../../../../../discord-framework'
import { sentry } from '../../../../../logging'
import { maxIndex, nonNullable } from '../../../../../utils/utils'
import { App } from '../../../../context/app_context'
import { Guild, Match } from '../../../../database/models'
import { MatchStatus } from '../../../../database/models/matches'
import { Colors } from '../../../common/constants'
import { emojis, relativeTimestamp } from '../../../common/strings'
import { default_elo_settings } from '../../rankings/manage_rankings'
import { rateTrueskill } from '../management/elo_calculation'
import { syncMatchesChannel } from '../matches_channel'

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
      await syncMatchSummaryMessage(app, match, item.guild)
    }),
  )
}

/**
 * Updates the match's summary message, according to the guild ranking's settings
 */
export async function syncMatchSummaryMessage(
  app: App,
  match: Match,
  guild: Guild,
): Promise<D.APIMessage> {
  // Check whether match logging is enabled for this guild ranking
  const guild_ranking = await app.db.guild_rankings.get({
    guild_id: guild.data.id,
    ranking_id: match.data.ranking_id,
  })

  if (
    app.config.features.DisableLogMatchesOption &&
    !guild_ranking.data.display_settings?.log_matches
  ) {
    // don't log the match
    throw new Error(`Not implemented`)
  }

  const matches_channel = await syncMatchesChannel(app, guild)

  const stored_message = await match.getSummaryMessage(guild.data.id)

  const sync_message_result = await app.bot.utils.syncChannelMessage({
    target_channel_id: matches_channel.id,
    target_message_id: stored_message?.message_id,
    messageData: await matchSummaryMessageData(app, match),
  })

  if (sync_message_result.is_new_message) {
    await match.updateSummaryMessage(guild.data.id, sync_message_result.message.id)
  }

  return sync_message_result.message
}

export async function matchSummaryMessageData(app: App, match: Match): Promise<MessageData> {
  return new MessageData({
    embeds: [
      await matchSummaryEmbed(app, match, {
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
  include?: {
    ranking_name?: boolean
    id?: boolean
    time_finished?: boolean
    include_outcome_num?: boolean
  },
): Promise<D.APIEmbed> {
  sentry.debug(`getting ranking`)
  const ranking = await match.ranking()
  const team_players = await match.teamPlayers()

  let details: string[] = []

  if (include?.id) {
    details.push(`-# id: \`${match.data.id}\``)
  }

  const embed: D.APIEmbed = {
    title: ``,
    fields: [],
    color: Colors.EmbedBackground,
  }

  embed.title = `${ranking.data.name} Match`

  if (match.data.status === MatchStatus.Finished) {
    const outcome = nonNullable(match.data.outcome, 'match.outcome')

    const new_ratings = rateTrueskill(
      outcome,
      team_players,
      ranking.data.elo_settings ?? default_elo_settings,
      match.data.metadata?.best_of,
    )

    const winning_team_index = maxIndex(outcome)
    const is_draw = winning_team_index === -1

    embed.fields = team_players.map((team, team_num) => {
      const team_outcome = `${outcome[team_num]}`
      return {
        name: is_draw
          ? emojis.light_circle + (include?.include_outcome_num ? team_outcome : `Draw`)
          : team_num === winning_team_index
            ? emojis.green_triangle + (include?.include_outcome_num ? team_outcome : `Win`)
            : emojis.red_triangle + (include?.include_outcome_num ? team_outcome : `Loss`),
        value: team
          .map((player, player_num) => {
            const rating_after_text = new_ratings[team_num][player_num].new_rating.toFixed(0)
            const diff = new_ratings[team_num][player_num].new_rating - player.rating_before
            const rating_diff_text = (parseInt(diff.toFixed(0)) > 0 ? '+' : '') + diff.toFixed(0)
            return `<@${player.player.data.user_id}> ${rating_after_text} *(${rating_diff_text})*`
          })
          .join('\n'),
        inline: true,
      }
    })

    embed.color = Colors.Primary
  } else {
    // embed.title = `Match ${match.data.number} (In Progress)`

    embed.fields = team_players.map((team, team_num) => {
      return {
        name: `${team.length > 1 ? `Team` : `Player`} ${team_num + 1}`,
        value: team.map(player => `<@${player.player.data.user_id}>`).join('\n'),
        inline: true,
      }
    })

    embed.color = Colors.DiscordBackground
  }

  if (match.data.time_finished) {
    details.push(`-# Finished ${relativeTimestamp(match.data.time_finished)}`)
  } else if (match.data.time_started) {
    details.push(`-# Started ${relativeTimestamp(match.data.time_started)}`)
  }

  embed.fields = embed.fields?.concat(
    details
      ? [
          {
            name: `Details`,
            value: details.join('\n'),
          },
        ]
      : [],
  )

  return embed
}
