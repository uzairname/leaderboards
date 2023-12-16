import { DbClient } from './client'

import DbCache from './cache'

export abstract class DbObjectManager {
  public cache: any = {}
  constructor(protected db: DbClient) {
    this.cache = new DbCache()
  }
}

export abstract class DbObject<SelectType> {
  constructor(
    public data: SelectType,
    protected db: DbClient,
  ) {}
}
