export abstract class DatabaseError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${DatabaseError.name}.${this.constructor.name}`
  }
}

export namespace DbErrors {
  export class ReferenceError extends DatabaseError {}

  export class NotFoundError extends DatabaseError {}

  export class ArgumentError extends DatabaseError {}

  export class ValidationError extends DatabaseError {}
}
