import { Match, Ranking } from '@repo/db/models'
import { MessageData } from '@repo/discord'
import { commandMention, escapeMd, relativeTimestamp } from '.'
import { join_cmd } from '../../interactions/all-interaction-handlers'
import { App } from '../../setup/app'

export const concise_description = `This bot hosts ranked ladders for any game by tracking matches between players. It has additional features for matchmaking, analytics, moderation, and cross-server rankings.`

export const queueJoinMessage = ({
  app,
  match,
  already_in,
  ranking,
}: {
  app: App
  match?: Match
  already_in: boolean
  ranking: Ranking
}) => {
  return match
    ? `A match has been found!` + match.data.ongoing_match_channel_id
      ? ` <#${match.data.ongoing_match_channel_id}>`
      : ''
    : (already_in ? `You rejoined the queue` : 'You joined the queue') +
        ` for ${escapeMd(ranking.data.name)}.` +
        ` You'll be removed ${relativeTimestamp(new Date(Date.now() + app.config.QueueJoinTimeoutMinutes / (60 * 1000)))} if a match isn't found.`
}

export const someone_joined_queue = async (app: App, ranking: Ranking, guild_id: string): Promise<MessageData> => {
  return new MessageData({
    content: `${await commandMention(app, join_cmd, guild_id)} - Someone has joined the queue for ${escapeMd(ranking.data.name)}`,
  })
}
