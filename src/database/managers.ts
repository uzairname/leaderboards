import { DbClient } from './client'

export abstract class DbObjectManager {
  constructor(protected db: DbClient) {}
}

export interface DbObject<SelectType> {
  data: SelectType
  db: DbClient
}
