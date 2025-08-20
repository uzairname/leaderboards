import { PartialRanking, Player, Team } from '@repo/db/models'
import { App } from '../../setup/app'
import { calculateTeamRating } from './properties'

export async function createTeam({
  app,
  name,
  ranking,
  players,
}: {
  app: App
  name?: string
  ranking: PartialRanking
  players: Player[]
}): Promise<Team> {
  const rating = await calculateTeamRating(players, ranking)
  return await app.db.teams.create(ranking, players, { name, rating })
}
