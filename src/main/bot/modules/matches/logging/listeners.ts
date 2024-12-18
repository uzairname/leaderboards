import { AppEvents } from '../../../../app/AppEvents'
import { syncMatchSummaryMessages } from './match-summary-message'

export default function (events: AppEvents) {
  events.MatchCreatedOrUpdated.on(async (app, match) => {
    await syncMatchSummaryMessages(app, match)
  })
}
