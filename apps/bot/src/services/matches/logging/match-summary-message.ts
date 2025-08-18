import { Match, PartialGuild } from '@repo/db/models'
import { MessageData } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { matchSummaryEmbed } from '../ui/matches/view'
import { syncMatchesChannel } from './matches-channel'

/**
 * Sync match summary messages for this match across all guilds the match's ranking is in
 */
export async function syncMatchSummaryMessages(app: App, match: Match): Promise<void> {
  const guild_rankings = await app.db.guild_rankings.fetch({ ranking_id: match.data.ranking_id })
  app.logger.debug(`syncMatchSummaryMessages ${match} in ${guild_rankings.length} guilds`)
  await Promise.all(
    guild_rankings.map(async item => {
      await syncMatchSummaryMessage(app, match, item.guild)
    }),
  )
}

/**
 * Updates the match's summary message, according to the guild ranking's settings. Creates it if it doesn't exist
 */
export async function syncMatchSummaryMessage(app: App, match: Match, p_guild: PartialGuild): Promise<D.APIMessage> {
  app.logger.debug(`syncMatchSummaryMessage ${match}, ${p_guild}`)
  // Check whether match logging is enabled for this guild ranking
  const { guild } = await app.db.guild_rankings.fetch({
    guild_id: p_guild.data.id,
    ranking_id: match.data.ranking_id,
  })

  const summary_message = await match.summaryMessage(guild.data.id)

  const sync_message_result = await app.discord.utils.syncChannelMessage({
    target_channel_id: guild.data.matches_channel_id,
    target_message_id: summary_message?.message_id,
    messageData: () => matchSummaryMessageData(app, match),
    getChannel: () => syncMatchesChannel(app, guild, true),
  })

  if (sync_message_result.is_new_message) {
    await match.updateSummaryMessage(guild.data.id, sync_message_result.channel_id, sync_message_result.message.id)
  }

  return sync_message_result.message
}

export async function matchSummaryMessageData(app: App, match: Match): Promise<MessageData> {
  return new MessageData({
    embeds: [await matchSummaryEmbed(app, match)],
  })
}
