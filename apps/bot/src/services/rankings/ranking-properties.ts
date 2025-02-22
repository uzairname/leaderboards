import { PartialGuildRanking } from '@repo/database/models'

export async function isQueueEnabled(pgr: PartialGuildRanking) {
    const gr = await pgr.fetch()

    // TODO: Add guild_ranking.data.matchmaking_settings.queue_enabled property

    // if (gr.guild_ranking.data.matchmaking_settings.queue_enabled !== undefined) {
    //     return gr.guild_ranking.data.matchmaking_settings.queue_enabled
    // } else {
    // }

    return gr.ranking.data.matchmaking_settings.queue_enabled
}