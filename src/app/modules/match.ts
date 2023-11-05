import { Player, RankingDivision } from '../../database/models'

export async function createMatchWithTeams(params: {
  leaderboard_division: RankingDivision
  teams: Array<Array<Player>>
}): Promise<void> {
  const match_teams = params.teams.map((team) => {
    if (!team.length) {
      return team.map((player) => {
        return player.data.user_id
      })
    }
  })
}
