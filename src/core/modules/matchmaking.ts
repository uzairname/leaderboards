import { Leaderboard, LeaderboardDivision, Player } from '../../database/models'
import { Errors } from '../errors'

async function findMatchFromQueue(leaderboard: Leaderboard): Promise<Array<Array<Player>>> {
  throw new Errors.NotImplimented()
}

export async function createMatchWithTeams(params: {
  leaderboard_division: LeaderboardDivision
  teams: Array<Array<Player>>
}): Promise<void> {
  const match_teams = params.teams.map((team) => {
    return team.map((player) => {
      return player.data.user_id
    })
  })
}
