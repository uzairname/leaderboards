export class Event<EventData> {
  callbacks: ((data: EventData) => Promise<void>)[] = []

  on(callback: (data: EventData) => Promise<void>) {
    this.callbacks.push(callback)
  }

  async emit(data: EventData): Promise<void> {
    await Promise.all(this.callbacks.map(async (c) => c(data)))
  }
}
