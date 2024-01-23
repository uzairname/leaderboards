import { and, eq, sql, desc, inArray, SQL } from 'drizzle-orm'
import { Player, Ranking } from '..'
import { sentry } from '../../../request/sentry'
import { cloneSimpleObj, nonNullable } from '../../../utils/utils'
import { DbClient } from '../../client'
import { DbObject, DbObjectManager } from '../../managers'
import { MatchPlayers, Matches, Players } from '../../schema'
import { MatchInsert, MatchPlayerSelect, MatchSelect, MatchUpdate, PlayerSelect } from '../../types'

export class Match extends DbObject<MatchSelect> {
  constructor(data: MatchSelect, db: DbClient) {
    super(data, db)
    db.cache.matches[data.id] = this
  }

  async ranking(): Promise<Ranking> {
    return this.db.rankings.get(this.data.ranking_id)
  }

  async teams(): Promise<{ player: Player; match_player: MatchPlayerSelect }[][]> {
    const players = await this.db.db
      .select({ player: Players, match_player: MatchPlayers })
      .from(MatchPlayers)
      .where(eq(MatchPlayers.match_id, this.data.id))
      .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))

    const player_teams = Array.from(
      { length: nonNullable(this.data.team_players).length },
      () => [] as { player: Player; match_player: MatchPlayerSelect }[],
    )

    players.forEach(player => {
      player_teams[nonNullable(player.match_player.team_num, 'match_player.team_num')].push({
        player: new Player(player.player, this.db),
        match_player: player.match_player,
      })
    })

    return player_teams
  }

  async update(
    data: { team_players_before: { id: number; rating: number; rd: number }[][] } & Omit<
      MatchUpdate,
      'team_players' | 'number'
    >,
  ): Promise<this> {
    this.data = (
      await this.db.db
        .update(Matches)
        .set({
          ...data,
          team_players: data.team_players_before.map(team => team.map(player => player.id)),
        })
        .where(eq(Matches.id, this.data.id))
        .returning()
    )[0]

    // update all match players' ratings and rd before
    await Promise.all(
      data.team_players_before.flat().map(player => {
        this.db.db
          .update(MatchPlayers)
          .set({
            rating_before: player.rating,
            rd_before: player.rd,
          })
          .where(
            and(eq(MatchPlayers.match_id, this.data.id), eq(MatchPlayers.player_id, player.id)),
          )
      }),
    )

    return this
  }
}

export class MatchesManager extends DbObjectManager {
  async create(
    data: { team_players: Player[][] } & Omit<MatchInsert, 'team_players'>,
  ): Promise<Match> {
    const new_match_data = (
      await this.db.db
        .insert(Matches)
        .values({
          ...data,
          team_players: data.team_players.map(team => team.map(player => player.data.id)),
        })
        .returning()
    )[0]

    const new_match = new Match(new_match_data, this.db)

    const match_players_data = data.team_players
      .map((team, team_num) => {
        return team.map(player => {
          return {
            match_id: new_match_data.id,
            player_id: player.data.id,
            team_num,
            rating_before: player.data.rating,
            rd_before: player.data.rd,
          }
        })
      })
      .flat()

    // insert new MatchPlayers
    await this.db.db.insert(MatchPlayers).values(match_players_data).returning()

    return new_match
  }

  async get(filters: {
    player_ids?: number[]
    user_ids?: string[]
    ranking_ids?: number[]
    after?: Match
    limit_matches?: number
    offset?: number
  }): Promise<{ match: Match; teams: { player: Player; match_player: MatchPlayerSelect }[][] }[]> {
    const default_limit = 10

    let sql_chunks: SQL[] = []

    if (filters.player_ids) {
      sql_chunks.push(sql`${Matches.id} in (
        select ${MatchPlayers.match_id} from ${MatchPlayers} 
        where ${MatchPlayers.player_id} in ${filters.player_ids}
      )`)
    }

    if (filters.user_ids) {
      sql_chunks.push(sql`${Matches.id} in (
        select ${MatchPlayers.match_id} from ${MatchPlayers}
        where ${Players.user_id} in ${filters.user_ids}
        inner join ${Players} on ${Players.id} = ${MatchPlayers.player_id}
      )`)
    }

    if (filters.ranking_ids) {
      sql_chunks.push(inArray(Matches.ranking_id, filters.ranking_ids))
    }

    if (filters.after) {
      const date = nonNullable(filters.after.data.time_finished, 'time_finished')
      sql_chunks.push(sql`${Matches.time_finished} < ${date}`)
    }

    const matches_sql = sql`
      ${Matches.id} in (select ${Matches.id} from ${Matches} where ${and(...sql_chunks)} order by ${
        Matches.time_finished
      } desc${filters.limit_matches ? sql` limit ${filters.limit_matches}` : ``} offset ${
        filters.offset ?? 0
      })
    `
    const result = await this.db.db
      .select({ match: Matches, player: Players, match_player: MatchPlayers })
      .from(Matches)
      .innerJoin(MatchPlayers, eq(Matches.id, MatchPlayers.match_id))
      .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))
      .where(matches_sql)

    const matches = new Map<
      number,
      { match: Match; teams: { player: Player; match_player: MatchPlayerSelect }[][] }
    >()

    result.forEach(row => {
      const match_id = nonNullable(row.match.id, 'match id')

      if (!matches.has(match_id)) {
        matches.set(match_id, {
          match: new Match(row.match, this.db),
          teams: Array.from(
            { length: nonNullable(row.match.team_players).length },
            () => [] as { player: Player; match_player: MatchPlayerSelect }[],
          ),
        })
      }

      const match = matches.get(match_id)!

      match.teams[nonNullable(row.match_player.team_num, 'match_player.team_num')].push({
        player: new Player(row.player, this.db),
        match_player: row.match_player,
      })
    })

    return Array.from(matches.values())
  }
}
