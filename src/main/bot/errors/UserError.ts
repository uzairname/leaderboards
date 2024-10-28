export class UserError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${UserError.name}.${this.constructor.name}`
  }
}

// Errors that are expected and displayed to the user
export namespace UserErrors {
  export class NotComponentOwner extends UserError {
    constructor(owner_id?: string) {
      super(
        owner_id
          ? `This message belongs to <@${owner_id}>`
          : `This message belongs to someone else`,
      )
    }
  }

  export class ValidationError extends UserError {}
}
