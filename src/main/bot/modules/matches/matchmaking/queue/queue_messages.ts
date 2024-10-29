import type { GuildRanking } from '../../../../../../database/models'
import type { App } from '../../../../../app/App'
import { queueMessage } from '../views/pages/queue'

export async function sendGuildRankingQueueMessage(
  app: App,
  guild_ranking: GuildRanking,
  channel_id: string,
): Promise<{ message_id: string }> {
  const result = await app.discord.utils.syncChannelMessage({
    target_channel_id: channel_id,
    messageData: await queueMessage(app, guild_ranking.data.ranking_id),
  })
  return { message_id: result.message.id }
}
