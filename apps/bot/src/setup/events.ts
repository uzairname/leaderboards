import { Match } from '@repo/db/models'
import { Event } from '@repo/utils'
import { App } from './app'

export class AppEvent<EventData> extends Event<App, EventData> {}

export function getAppEvents(app: App, registerEventListeners: ((events: AppEvents) => void)[]) {
  const events = {
    // An event associated with a match
    Placeholder: new AppEvent<Match>(app),
  }

  registerEventListeners.forEach(register => register(events))

  return events
}

export type AppEvents = ReturnType<typeof getAppEvents>
