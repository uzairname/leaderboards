import { Player, Ranking } from '../../../../database/models'
import { AppErrors } from '../../../app/errors'

/**
 *
 */
async function findMatchFromQueue(ranking: Ranking): Promise<Array<Array<Player>>> {
  /*
  When a match is created, all queue users are removed from all other queue teams they're in.
  */
  throw new AppErrors.NotImplimented()
}

/**
 * Given
 */
export async function createMatchWithTeams(params: {
  ranking: Ranking
  teams: Array<Array<Player>>
}): Promise<void> {
  const match_teams = params.teams.map(team => {
    if (!team.length)
      return team.map(player => {
        return player.data.user_id
      })
  })
}
