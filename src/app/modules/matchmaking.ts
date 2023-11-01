import { Ranking, RankingDivision, Player } from '../../database/models'
import { Errors } from '../errors'

/**
 *
 */
async function findMatchFromQueue(leaderboard: Ranking): Promise<Array<Array<Player>>> {
  /*
  When a match is created, all queue users are removed from all other queue teams they're in.
  */
  throw new Errors.NotImplimented()
}

/**
 * Given
 */
export async function createMatchWithTeams(params: {
  leaderboard_division: RankingDivision
  teams: Array<Array<Player>>
}): Promise<void> {
  const match_teams = params.teams.map((team) => {
    if (!team.length)
      return team.map((player) => {
        return player.data.user_id
      })
  })
}
