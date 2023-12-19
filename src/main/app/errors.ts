export class AppError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${AppError.name}.${this.constructor.name}`
  }
}

// Errors that are expected and displayed to the user
export namespace AppErrors {
  export class InteractionNotGuild extends AppError {
    constructor() {
      super('Use this command in a server')
    }
  }

  export class UserMissingPermissions extends AppError {}

  export class NotComponentOwner extends AppError {
    constructor(owner_id?: string) {
      super(
        owner_id
          ? `This message belongs to <@${owner_id}>`
          : `This message belongs to someone else`,
      )
    }
  }

  export class ValidationError extends AppError {}

  export class UnknownState extends AppError {
    constructor(state?: string) {
      super(`Unhandled custom id state "${state}"`)
    }
  }

  export class NotImplimented extends AppError {}

  export class MissingIdentifyScope extends AppError {
    constructor() {
      super("Can't save oauth token: No identify scope")
    }
  }

  export class InvalidViews extends AppError {}
}
