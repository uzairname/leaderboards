import { nonNullable } from '../../../../../utils/utils'
import { App } from '../../../../context/app_context'
import { Match, Player } from '../../../../database/models'
import { MatchInsert } from '../../../../database/models/types'
import { validate } from '../../../utils/validate'
import { scoreRankingHistory } from './score_matches'

export async function updateMatch(
  app: App,
  match: Match,
  outcome?: number[],
  metadata?: { [key: string]: unknown },
) {
  validateMatch({
    ...match.data,
    outcome,
    metadata,
  })

  await match.update({
    outcome,
    metadata,
  })

  if (outcome) {
    await scoreRankingHistory(app, await match.ranking(), match.data.time_finished ?? undefined)
  }

  await app.events.MatchCreatedOrUpdated.emit(match)
}

export async function deleteMatch(app: App, match: Match): Promise<void> {
  // delete summary messages before deleting match
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: match.data.ranking_id })
  await Promise.all(
    guild_rankings.map(async guild_ranking => {
      const summary_message = await match.getSummaryMessage(guild_ranking.guild.data.id)
      await app.bot.utils.deleteMessageIfExists(
        guild_ranking.guild.data.match_results_channel_id,
        summary_message?.message_id,
      )
    }),
  )

  // get player ratings before deleting match
  const player_ratings_before = Object.fromEntries(
    (await match.teams())
      .map(t =>
        t.map(p => [
          p.player.data.id,
          {
            rating: nonNullable(p.match_player.rating_before, 'rating before'),
            rd: nonNullable(p.match_player.rd_before, 'rd before'),
          },
        ]),
      )
      .flat(),
  )

  await match.delete()

  // score ranking history without match
  await scoreRankingHistory(
    app,
    await match.ranking(),
    match.data.time_finished ?? undefined,
    player_ratings_before,
  )
}

export function validateMatch<T extends Partial<{ players: Player[][] } & MatchInsert>>(o: T): T {
  if (o.outcome) {
    if (o.team_players) {
      validate(
        o.outcome!.length === o.team_players!.length,
        `Match outcome and players length must match`,
      )
    }
    if (o.players) {
      validate(
        o.outcome!.length === o.players!.length,
        `Match outcome and players length must match`,
      )
    }
  }
  if (o.players) {
    validate(
      o.players.flat().length === new Set(o.players.flat()).size,
      `Duplicate players in a match`,
    )
    validate(
      o.players.flat().every(p => p.data.ranking_id === o.ranking_id),
      `Players must be from the same ranking`,
    )
  }
  return o
}
