import { DbClient } from './client'

export abstract class DbObjectManager {
  constructor(protected db: DbClient) {}
}

export abstract class DbObject<SelectType> {
  constructor(
    public data: SelectType,
    protected db: DbClient,
  ) {}
}
