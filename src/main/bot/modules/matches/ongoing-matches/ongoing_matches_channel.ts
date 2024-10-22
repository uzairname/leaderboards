import * as D from 'discord-api-types/v10'
import { App } from '../../../../context/app_context'
import { GuildRanking } from '../../../../database/models'
import { syncMatchesChannel } from '../matches_channel'

export async function syncOngoingMatchesChannel(
  app: App,
  guild_ranking: GuildRanking,
): Promise<D.APIChannel> {
  // By default, the ongoing matches channel is the guild's match logs channel

  const guild = await guild_ranking.guild
  const result = await syncMatchesChannel(app, guild)
  return result
}
