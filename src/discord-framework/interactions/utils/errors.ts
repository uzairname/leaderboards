export abstract class ViewError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `ViewError.${this.constructor.name}`
  }
}

export namespace ViewErrors {
  export class UnknownView extends ViewError {}

  export class AutocompleteNotImplemented extends ViewError {}

  export class ComponentCallbackNotImplemented extends ViewError {}

  export class DeferNotImplemented extends ViewError {}

  export class InvalidEncodedCustomId extends ViewError {}

  export class CustomIdTooLong extends ViewError {
    constructor(custom_id: string) {
      super(`Custom id is ${custom_id.length} characters long: ${custom_id}`)
    }
  }

  export class InvalidCustomId extends ViewError {}
}
