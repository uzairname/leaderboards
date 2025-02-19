import { PartialGuild } from 'database/models/guilds'
import { App } from '../../../setup/app'

export const getChallengeEnabledRankings = async (app: App, guild: PartialGuild) => {
  const guild_rankings = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })

  const result = guild_rankings.filter(r => {
    return r.ranking.data.matchmaking_settings.direct_challenge_enabled
  })

  return result
}
