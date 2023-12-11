import { Ranking } from '../../database/models'
import { App } from '../app'

/**
 * Record a completed match. Update everyone's scores.
 * @param team_player_ids list of player ids for each team
 * @param outcome relative team scores
 */
export async function finishMatch(
  app: App,
  ranking: Ranking,
  team_player_ids: string[][],
  outcome: number[],
  metadata?: { [key: string]: any },
) {
  await app.db.matches.create({
    ranking_id: ranking.data.id,
    team_users: team_player_ids,
    outcome: outcome,
    metadata: metadata,
  })

  await scoreLeaderboardHistory(ranking)
}

export async function scoreLeaderboardHistory(ranking: Ranking) {
  /*
    update all players' score based on match history
    */

  const matches = await ranking.latestMatches()

  const team_history = matches.map((match) => {
    return match.data.team_users
  })

  const outcome_history = matches.map((match) => {
    return match.data.outcome
  })
}
