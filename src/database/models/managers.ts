import { DbClient } from '../client'

export class DbObjectManager {
  constructor(protected db: DbClient) {}
}

export class DbObject<SelectType> {
  constructor(
    public data: SelectType,
    protected db: DbClient,
  ) {}
}
