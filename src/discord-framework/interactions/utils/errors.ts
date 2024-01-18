export class ViewError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `ViewError.${this.constructor.name}`
  }
}

export namespace ViewErrors {
  export class UnknownView extends ViewError {}

  export class InvalidViewType extends ViewError {
    constructor() {
      super(`Invalid view type for interaction type`)
    }
  }

  export class CustomIdTooLong extends ViewError {
    constructor(custom_id: string) {
      super(`Custom id is ${custom_id.length} characters long: ${custom_id}`)
    }
  }

  export class InvalidEncodedCustomId extends ViewError {}

  export class InvalidCustomId extends ViewError {}

  export class CallbackNotImplemented extends ViewError {}
}
