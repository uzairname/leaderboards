import { DbClient } from './client'

export class DbObjectManager {
  constructor(protected client: DbClient) {}
}

export class DbObject<SelectType> {
  constructor(
    public data: SelectType,
    protected client: DbClient,
  ) {}
}
