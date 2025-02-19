import { AppEvents } from '../../../setup/events'
import { syncMatchSummaryMessages } from './match-summary-message'

export default function (events: AppEvents) {
  events.MatchCreatedOrUpdated.on(async (app, match) => {
    await syncMatchSummaryMessages(app, match)
  })
}
