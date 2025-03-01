export class InteractionError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${InteractionError.name}.${this.constructor.name}`
  }
}

export class InteractionUserError extends InteractionError {
  constructor(message?: string) {
    super(message)
    this.name = `${InteractionUserError.name}.${this.constructor.name}`
  }
}

export namespace InteractionErrors {
  /**
   * No unique command matches the command name and type
   */
  export class UnknownCommand extends InteractionUserError {
    constructor() {
      super(`Unrecognized command`)
    }
  }

  /**
   * No unique view matches the custom id
   */
  export class UnknownView extends InteractionUserError {
    constructor() {
      super(`Unrecognized component. It may be outdated`)
    }
  }

  /**
   * LZstring fails to decompress the encoded part of the custom id
   */
  export class DecompressError extends InteractionUserError {
    constructor(encoded_data: string) {
      super(`Unable to decompress from UTF 16: '${encoded_data}'`)
    }
  }

  /**
   * Any error while parsing the custom id into a state and view
   */
  export class CustomIdParseError extends InteractionUserError {
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
  export class WrongContext extends InteractionUserError {}
}
