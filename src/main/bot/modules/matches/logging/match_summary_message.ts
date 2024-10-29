import * as D from 'discord-api-types/v10'
import { Guild, Match } from '../../../../../database/models'
import { MatchStatus } from '../../../../../database/models/matches'
import { MessageData } from '../../../../../discord-framework'
import { maxIndex } from '../../../../../utils/utils'
import { App } from '../../../../app/App'
import { Colors } from '../../../helpers/constants'
import { emojis, escapeMd, relativeTimestamp } from '../../../helpers/strings'
import { getMatchPlayersDisplayStats } from '../../players/display_stats'
import { syncMatchesChannel } from '../matches_channel'

/**
 * Sync match summary messages for this match across all guilds the match's ranking is in
 */
export async function syncMatchSummaryMessages(app: App, match: Match): Promise<void> {
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

  const sync_message_result = await app.discord.utils.syncChannelMessage({
    target_channel_id: matches_channel.id,
    target_message_id: stored_message?.message_id,
    messageData: await matchSummaryMessageData(app, match),
  })

  if (sync_message_result.is_new_message) {
    await match.updateSummaryMessage(
      guild.data.id,
      matches_channel.id,
      sync_message_result.message.id,
    )
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
  },
): Promise<D.APIEmbed> {
  const ranking = await match.ranking()

  const team_player_stats = await getMatchPlayersDisplayStats(match)

  let details: string[] = []

  if (include?.id) {
    details.push(`-# id: \`${match.data.id}\``)
  }

  const embed: D.APIEmbed = {
    title: `${escapeMd(ranking.data.name)} Match #${match.data.number}`,
    color: match.data.status === MatchStatus.Finished ? Colors.Primary : Colors.DiscordBackground,
  }

  embed.fields = team_player_stats.map((team, team_num) => {
    return {
      name: (outcome => {
        if (outcome) {
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
        .map(player => {
          if (player.rating_after !== undefined && player.provisional_after !== undefined) {
            const rating_before_text = player.rating_before.toFixed(0)
            const rating_after_text = player.rating_after.toFixed(0)
            const diff = player.rating_after - player.rating_before

            const rating_diff_text = (parseInt(diff.toFixed(0)) > 0 ? '+' : '') + diff.toFixed(0)

            return (
              `<@${player.user_id}>` +
              `\n\`${rating_before_text}\` → **${rating_after_text}** (${rating_diff_text})`
            )
          }
          



        })
        .join('\n'),
      inline: true,
    }
  })

  embed.color = Colors.Primary

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
