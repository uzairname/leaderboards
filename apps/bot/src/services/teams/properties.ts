import { PartialRanking, Player } from '@repo/db/models'
import { nonNullable } from '@repo/utils'

export async function calculateTeamRating(players: Player[], ranking: PartialRanking): Promise<number> {
  const r = await ranking.fetch()
  const initial_rating = nonNullable(r.data.rating_settings.initial_rating.mu, 'initial_rating')

  return players.length > 0
    ? players.reduce((acc, player) => {
        const rating = player.data.rating.mu ?? initial_rating
        return acc + rating
      }, 0) / players.length
    : initial_rating
}
