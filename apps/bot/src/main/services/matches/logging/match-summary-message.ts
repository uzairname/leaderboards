import { Match, MatchStatus, PartialGuild } from '@repo/database/models'
import { MessageData } from '@repo/discord'
import { maxIndex } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../../../logging/sentry'
import { App } from '../../../setup/app'
import { Colors } from '../../../ui-helpers/constants'
import { emojis, escapeMd, relativeTimestamp, spaces } from '../../../ui-helpers/strings'
import { getMatchPlayersDisplayStats } from '../../players/display'
import { syncMatchesChannel } from './matches-channel'

/**
 * Sync match summary messages for this match across all guilds the match's ranking is in
 */
export async function syncMatchSummaryMessages(app: App, match: Match): Promise<void> {
  const guild_rankings = await app.db.guild_rankings.fetch({ ranking_id: match.data.ranking_id })
  sentry.debug(`syncMatchSummaryMessages ${match} in ${guild_rankings.length} guilds`)
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
  p_guild: PartialGuild,
): Promise<D.APIMessage> {
  sentry.debug(`syncMatchSummaryMessage ${match}, ${p_guild}`)
  // Check whether match logging is enabled for this guild ranking
  const { guild_ranking, guild } = await app.db.guild_rankings.fetch({
    guild_id: p_guild.data.id,
    ranking_id: match.data.ranking_id,
  })

  if (
    app.config.features.DisableLogMatchesOption &&
    !guild_ranking.data.display_settings?.log_matches
  ) {
    // don't log the match
    throw new Error(`Not implemented`)
  }

  const summary_message = await match.getSummaryMessage(guild.data.id)

  const sync_message_result = await app.discord.utils.syncChannelMessage({
    target_channel_id: guild.data.matches_channel_id,
    target_message_id: summary_message?.message_id,
    messageData: () => matchSummaryMessageData(app, match),
    getChannel: () => syncMatchesChannel(app, guild, true),
  })

  if (sync_message_result.is_new_message) {
    await match.updateSummaryMessage(
      guild.data.id,
      sync_message_result.channel_id,
      sync_message_result.message.id,
    )
  }

  return sync_message_result.message
}

export async function matchSummaryMessageData(app: App, match: Match): Promise<MessageData> {
  return new MessageData({
    embeds: [await matchSummaryEmbed(app, match)],
  })
}

async function conciseMatchSummary(app: App, match: Match) {}

export async function matchSummaryEmbed(app: App, match: Match, {} = {}): Promise<D.APIEmbed> {
  const ranking = await match.ranking.fetch()

  const team_player_stats = await getMatchPlayersDisplayStats(app, match)

  const embed: D.APIEmbed = {
    description:
      `### Match ${match.data.number} in ${escapeMd(ranking.data.name)}` +
      {
        [MatchStatus.Finished]: ``,
        [MatchStatus.Ongoing]: `\n**In Progress**`,
        [MatchStatus.Canceled]: `\n**Canceled**`,
      }[match.data.status],
    color: {
      [MatchStatus.Finished]: Colors.Primary,
      [MatchStatus.Ongoing]: Colors.Pending,
      [MatchStatus.Canceled]: Colors.EmbedBackground,
    }[match.data.status],
  }

  const fields: D.APIEmbedField[] = team_player_stats.map((team, team_num) => {
    return {
      name: (outcome => {
        if (match.data.status === MatchStatus.Finished && outcome) {
          const winning_team_index = maxIndex(outcome)
          const is_draw = winning_team_index === -1
          return is_draw
            ? emojis.light_circle + `Draw`
            : team_num === winning_team_index
              ? emojis.green_triangle + `Win`
              : emojis.red_triangle + `Loss`
        } else {
          return `${team.length > 1 ? `Team` : `Player`} ${team_num + 1}`
        }
      })(match.data.outcome),

      value: team
        .map(p => {
          const rating_before_text = p.before.is_provisional
            ? `\`${p.before.rating.toFixed(0)}?\``
            : `${p.before.rating.toFixed(0)}`

          if (p.after !== undefined) {
            const rating_after_text = p.after.is_provisional
              ? `\`${p.after.rating.toFixed(0)}?\``
              : `**${p.after.rating.toFixed(0)}**`

            const diff = p.after.rating - p.before.rating

            const rating_diff_text = p.after.is_provisional
              ? `\n-# (unranked)`
              : p.before.is_provisional
                ? ``
                : `\n-# ${spaces(2)}(${(parseInt(diff.toFixed(0)) > 0 ? '+' : '') + diff.toFixed(0)})`

            return (
              `<@${p.user_id}>` +
              `\n${rating_before_text} → ${rating_after_text}${rating_diff_text}`
            )
          } else {
            const provisional_text = p.before.is_provisional ? `\n-# (unranked)` : ``
            return `<@${p.user_id}>` + `\n${rating_before_text}${provisional_text}`
          }
        })
        .join('\n'),
      inline: true,
    }
  })

  let details: string[] = []

  details.push(`-# id: \`${match.data.id}\``)

  if (match.data.time_finished) {
    details.push(`-# Finished ${relativeTimestamp(match.data.time_finished)}`)
  } else if (match.data.time_started) {
    details.push(`-# Started ${relativeTimestamp(match.data.time_started)}`)
  }

  if (details) {
    fields.push({
      name: `Details`,
      value: details.join('\n'),
    })
  }

  embed.fields = fields

  return embed
}
