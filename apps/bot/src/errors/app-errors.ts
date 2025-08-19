export class AppError extends Error {
  /**
   * Any exception while interacting with the Bot.
   * @param message Message displayed in the embed body.
   * @param title Title of the error message.
   */

  constructor(
    message: string,
    public title?: string,
  ) {
    super(message)
    this.name = `${AppError.name}.${this.constructor.name}`
  }
}

export namespace AppErrors {
  export class RequestTimeoutError extends AppError {
    constructor(request_name: string, timeout_ms: number) {
      super(`"${request_name}" timed out after ${timeout_ms} ms`)
      this.name = RequestTimeoutError.name
    }
  }

  export class UnhandledState extends AppError {
    constructor(state: string) {
      super(`Unhandled state: ${state}`)
      this.name = UnhandledState.name
    }
  }
}
