import { AppEvents } from '../../context/events'
import { syncRankingLbMessages } from './leaderboard-message'

export default function (events: AppEvents) {
  events.RankingLeaderboardUpdated.on(async (app, ranking) => {
    await syncRankingLbMessages(app, ranking)
  })
}
