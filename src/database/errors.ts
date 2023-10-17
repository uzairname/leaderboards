export abstract class DatabaseError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${DatabaseError.name}.${this.constructor.name}`
  }
}

export namespace DatabaseErrors {
  export class ReferenceError extends DatabaseError {}

  export class NotFoundError extends DatabaseError {}
}
