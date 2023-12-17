export class UserError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${UserError.name}.${this.constructor.name}`
  }
}

// Errors that are expected and displayed to the user
export namespace UserErrors {
  export class InteractionNotGuild extends UserError {
    constructor() {
      super('Use this command in a server')
    }
  }

  export class UserMissingPermissions extends UserError {}

  export class NotComponentOwner extends UserError {
    constructor(owner_id?: string) {
      super(
        owner_id ? `This message belongs to <@${owner_id}>` : `This message belongs to someone else`
      )
    }
  }

  export class InvalidQueueTeamSize extends UserError {
    constructor(public required_team_size: number) {
      super(`Team must be of size ${required_team_size}`)
    }
  }
}

// Other errors that are not expected
export class AppError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${AppError.name}.${this.constructor.name}`
  }
}

export namespace AppErrors {
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
}
