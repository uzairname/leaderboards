import { PartialGuild } from '@repo/db/models'
import { App } from '../../setup/app'

export async function numRankings(app: App, guild: PartialGuild) {
  const items = await app.db.guild_rankings.getBy({ guild_id: guild.data.id })
  return items.length
}
