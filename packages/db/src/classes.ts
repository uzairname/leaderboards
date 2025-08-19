import { DbClient } from './client'

export abstract class DbObjectManager {
  constructor(protected db: DbClient) {}

  toJSON() {
    return this.toString()
  }
}

export abstract class DbObject<SelectType> {
  constructor(
    public data: SelectType,
    public db: DbClient,
  ) {}

  toJSON() {
    return this.toString()
  }
}
