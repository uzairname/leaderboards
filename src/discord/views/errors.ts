export abstract class ViewError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `InteractionError.${this.constructor.name}`
  }
}

export namespace ViewErrors {
  export class UnexpectedViewType extends ViewError {}

  export class UnknownType extends ViewError {}

  export class UnknownView extends ViewError {}

  export class AutocompleteNotImplemented extends ViewError {}

  export class NoComponentCallback extends ViewError {}

  export class DeferNotImplemented extends ViewError {}

  export class InvalidEncodedCustomId extends ViewError {}

  export class CustomIdTooLong extends ViewError {
    constructor(custom_id: string) {
      super(`Custom id ${custom_id.length} characters long: ${custom_id}`)
    }
  }
}
