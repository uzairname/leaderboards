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

  export class InvalidQueueTeamSize extends AppError {
    constructor(public required_team_size: number) {
      super(`Team must be of size ${required_team_size}`)
    }
  }
}

// Other errors

export class UnexpectedError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${UnexpectedError.name}.${this.constructor.name}`
  }
}

export namespace Errors {
  export class UnknownState extends UnexpectedError {
    constructor(state?: string) {
      super(`Unhandled custom id state "${state}"`)
    }
  }

  export class NotImplimented extends UnexpectedError {}

  export class MissingIdentifyScope extends UnexpectedError {
    constructor() {
      super("Can't save oauth token: No identify scope")
    }
  }

  export class UnknownRanking extends UnexpectedError {}
}
