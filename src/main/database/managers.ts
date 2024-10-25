import { DbClient } from './client'

export abstract class DbObjectManager {
  // cache: {[key: string | number]: any} = {}
  constructor(protected db: DbClient) {
    // this.cache = new DbCache()
  }
}

export abstract class DbObject<SelectType> {
  constructor(
    public data: SelectType,
    protected db: DbClient,
  ) {}
}
