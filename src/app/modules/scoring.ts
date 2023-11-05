import { RankingDivision } from '../../database/models'

export async function scoreLeaderboardHistory(division: RankingDivision) {
  /*
    update all players' score based on match history
    */

  const matches = await division.latestMatches()

  const history = matches.map((match) => {
    return {
      users: match.data.team_users,
      outcome: match.data.outcome,
    }
  })
}
