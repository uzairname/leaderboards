export class Event<Context, EventData> {
  constructor(private context: Context) {}

  listeners: ((context: Context, data: EventData) => Promise<void>)[] = []

  on(listener: (context: Context, data: EventData) => Promise<void>): void {
    this.listeners.push(listener)
  }

  async emit(data: EventData): Promise<void> {
    await Promise.all(this.listeners.map(listener => listener(this.context, data)))
  }
}
