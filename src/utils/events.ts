export class Event<EventData> {
  callbacks: ((data: EventData) => Promise<void>)[] = []

  on(callback: (data: EventData) => Promise<void>) {
    this.callbacks.push(callback)
  }

  async emit(data: EventData): Promise<void> {
    for (const callback of this.callbacks) {
      await callback(data)
    }
  }
}
