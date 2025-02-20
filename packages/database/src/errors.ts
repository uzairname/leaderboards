export abstract class DbError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${DbError.name}.${this.constructor.name}`
  }
}

export namespace DbErrors {
  export class NotFound extends DbError {}

  export class ValueError extends DbError {}

  export class MissingMatchPlayers extends DbError {}
}
