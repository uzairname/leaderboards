import { AppEvents } from '../../setup/events'
import { syncRankingLbMessages } from './leaderboard-message'

export default function (events: AppEvents) {
  events.RankingLeaderboardUpdated.on(async (app, ranking) => {
    await syncRankingLbMessages(app, ranking)
  })
}
