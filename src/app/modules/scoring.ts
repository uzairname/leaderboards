import { RankingDivision } from '../../database/models'

export async function scoreLeaderboardHistory(division: RankingDivision) {
  /*
    update all players' score based on match history
    */

  const matches = await division.latestMatches()

  const team_history = matches.map((match) => {
    return match.data.team_users
  })

  const outcome_history = matches.map((match) => {
    return match.data.outcome
  })
}
