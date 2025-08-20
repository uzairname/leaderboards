export class InteractionError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${InteractionError.name}.${this.constructor.name}`
  }
}

export namespace InteractionErrors {
  /**
   * No unique command matches the command name and type
   */
  export class UnknownCommand extends InteractionError {
    constructor() {
      super(`Unrecognized command`)
    }
  }

  /**
   * No unique view matches the custom id
   */
  export class UnknownView extends InteractionError {}

  /**
   * LZstring fails to decompress the encoded part of the custom id
   */
  export class DecompressError extends InteractionError {
    constructor(encoded_data: string) {
      super(`Unable to decompress from UTF 16: '${encoded_data}'`)
    }
  }

  /**
   * Any error while parsing the custom id into a state and view
   */
  export class CustomIdParseError extends InteractionError {
    constructor(custom_id: string, cause: unknown) {
      if (cause instanceof Error) {
        super(`Unable to parse custom id '${custom_id}'. ${cause.name}: ${cause.message}`)
      } else {
        super(`Unable to parse custom id '${custom_id}'. ${cause}`)
      }
    }
  }

  export class InvalidViewType extends InteractionError {
    constructor() {
      super(`Invalid view type for interaction type`)
    }
  }

  export class CustomIdTooLong extends InteractionError {
    constructor(custom_id: string) {
      super(`Custom id is ${custom_id.length} characters long: ${custom_id}`)
    }
  }

  export class CallbackNotImplemented extends InteractionError {
    constructor(callback: string) {
      super(`Callback not implemented: ${callback}`)
    }
  }

  export class InvalidOptionType extends InteractionError {}

  /**
   * For validating the context of an interaction. eg, DM or a guild
   */
  export class WrongContext extends InteractionError {}

  export class ResponseTimeExceeded extends InteractionError {
    constructor(time_ms: number, limit: number) {
      super(`Initial interaction response time ${time_ms}ms exceeded limit of ${limit}ms`)
    }
  }
}
