import { sentry } from '../request/sentry'

export class Event<EventData> {
  callbacks: ((data: EventData) => Promise<void>)[] = []

  on(callback: (data: EventData) => Promise<void>) {
    this.callbacks.push(callback)
  }

  async emit(data: EventData): Promise<void> {
    sentry.debug(`emitting event`)
    await Promise.all(
      this.callbacks.map(
        c =>
          new Promise<void>(resolve => {
            c(data).then(() => resolve())
          })
      )
    )
  }
}
