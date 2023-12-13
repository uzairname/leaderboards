class Event_<EventData> {
    constructor(public args: (eventData: EventData) => void) { }

    callbacks: ((data: EventData) => void)[] = []

    on(callback: (data: EventData) => void) {
        this.callbacks.push(callback)
    }

    emit(data: EventData) {
        this.callbacks.forEach(c=>c(data))
    }
}