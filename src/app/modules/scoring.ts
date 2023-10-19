import { LeaderboardDivision } from '../../database/models'

export async function scoreLeaderboardHistory(division: LeaderboardDivision) {
  /*
    update all players' score based on match history
    */

  const matches = await division.latestMatches()

  const team_history = matches.map((match) => {
    return match.data.team_players
  })

  const outcome_history = matches.map((match) => {
    return match.data.outcome
  })
}
