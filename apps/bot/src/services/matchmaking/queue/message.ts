import { ContainerBuilder, TextDisplayBuilder } from '@discordjs/builders'
import { Ranking } from '@repo/db/models'
import { MessageData } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { join_cmd } from '../../../interactions/all-interaction-handlers'
import { App } from '../../../setup/app'
import { Colors, commandMention, escapeMd, relativeTimestamp } from '../../utils/strings'

export async function someoneJoinedQueueMessage(app: App, ranking: Ranking, guild_id: string): Promise<MessageData> {
  const { guild_ranking } = await app.db.guild_rankings.fetch({
    ranking_id: ranking.data.id,
    guild_id,
  })

  const ping_role = guild_ranking.data.matchmaking_settings?.queue_join_ping_role_id

  return new MessageData({
    content:
      (ping_role ? `<@&${ping_role}> ` : ``) +
      `Someone has joined the queue for ${escapeMd(ranking.data.name)}! Use ${await commandMention(app, join_cmd, guild_id)} to join the queue yourself`,
  })
}

export function userJoinedQueueMessage({
  app,
  already_in,
  ranking,
}: {
  app: App
  already_in: boolean
  ranking: Ranking
}): MessageData {
  const expires_at = new Date(
    Date.now() + app.rankings.getProperties(ranking).matchmaking_settings.queue_join_timeout_minutes * 60 * 1000,
  )

  return new MessageData({
    components: [
      new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder({
            content:
              (already_in ? `You rejoined the queue` : 'You joined the queue') +
              ` for **${escapeMd(ranking.data.name)}**.` +
              `\n-# 💡 Turn on direct mention pings to get notified when a match is found. You'll be removed ${relativeTimestamp(expires_at)} if a match isn't found.`,
          }),
        )
        .setAccentColor(Colors.Success)
        .toJSON(),
    ],
    flags: D.MessageFlags.Ephemeral | D.MessageFlags.IsComponentsV2,
  })
}
