export class InteractionError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `ViewError.${this.constructor.name}`
  }
}

export namespace InteractionErrors {
  export class UnknownView extends InteractionError {
    constructor() {
      super(`Unrecognized command or component. It may be outdated`)
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

  export class CallbackNotImplemented extends InteractionError {}

  export class InvalidOptionType extends InteractionError {}
}
