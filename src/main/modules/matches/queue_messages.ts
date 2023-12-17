import type { GuildRanking } from '../../../database/models'
import type { App } from '../../app/app'
import queue_message from '../../views/messages/queue'

export async function haveRankingQueueMessage(
  app: App,
  guild_ranking: GuildRanking
): Promise<void> {
  const result = await app.bot.utils.syncChannelMessage({
    target_channel_id: guild_ranking.data.leaderboard_channel_id,
    target_message_id: guild_ranking.data.queue_message_id,
    messageData: async () => {
      return await queue_message(app).send({ ranking_id: guild_ranking.data.ranking_id })
    },
    channelData: async () => {
      throw new Error('No channel to post queue message in. Need to make ranking message first')
    }
  })

  if (result.is_new_message) {
    await guild_ranking.update({
      queue_message_id: result.message.id
    })
  }
}
