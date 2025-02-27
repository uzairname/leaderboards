export class InteractionError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${InteractionError.name}.${this.constructor.name}`
  }
}

export class InteractionUserError extends InteractionError {
  constructor(message?: string) {
    super(message)
    this.name = `${InteractionUserError}.${this.constructor.name}`
  }
}

export namespace InteractionErrors {
  export class UnknownView extends InteractionError {
    constructor() {
      super(`Unrecognized command or component. It may be outdated`)
    }
  }

  export class UnknownHandler extends InteractionError {
    constructor() {
      super(`This command or component may be outdated`)
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

  export class InvalidEncodedCustomId extends InteractionError {
    constructor(custom_id: string) {
      super(`Unable to decompress custom id '${custom_id}'`)
    }
  }

  export class InvalidCustomId extends InteractionError {}

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
