import { Matches } from '../../schema'
import { DbObject } from '../../object_manager'
import { DbObjectManager } from '../../object_manager'
import { MatchInsert, MatchSelect } from '../types'

export class Match extends DbObject<MatchSelect> {}

export class MatchesManager extends DbObjectManager {
  async create(data: MatchInsert): Promise<Match> {
    let new_data = (await this.client.db.insert(Matches).values(data).returning())[0]
    return new Match(new_data, this.client)
  }
}
