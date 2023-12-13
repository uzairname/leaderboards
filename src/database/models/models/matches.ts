import { eq } from 'drizzle-orm'
import { MatchPlayers, Matches, Players } from '../../schema'

import { DbObject, DbObjectManager } from '../managers'
import { MatchInsert, MatchPlayerSelect, MatchSelect } from '../types'
import { nonNullable } from '../../../utils/utils'
import { Player } from './players'

export class Match extends DbObject<MatchSelect> {
  async players(): Promise<{ player: Player, match_player: MatchPlayerSelect }[][]> {
    const players = await this.db.db
      .select({ player: Players, match_player: MatchPlayers })
      .from(MatchPlayers)
      .where(eq(MatchPlayers.match_id, this.data.id))
      .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))

    const player_teams = new Array<{ player: Player, match_player: MatchPlayerSelect }[]>(nonNullable(this.data.team_players).length)

    players.forEach((player) => {
      player_teams[nonNullable(player.match_player.team_num, 'match_player.team_num')].push({
        player: new Player(player.player, this.db),
        match_player: player.match_player,
      })
    })

    return player_teams
  }
}

export class MatchesManager extends DbObjectManager {
  async create(data: MatchInsert): Promise<Match> {
    let new_data = (await this.db.db.insert(Matches).values(data).returning())[0]
    return new Match(new_data, this.db)
  }
}
