import { and, eq, sql, desc, inArray, SQL } from 'drizzle-orm'
import { Player, Ranking } from '..'
import { sentry } from '../../../request/sentry'
import { cloneSimpleObj, nonNullable } from '../../../utils/utils'
import { DbClient } from '../../client'
import { DbObject, DbObjectManager } from '../../managers'
import {
  MatchPlayers,
  Matches,
  Players,
  match_cols,
  match_player_cols,
  player_cols,
} from '../../schema'
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

    let query = this.db.db
      .select({ match: Matches, player: Players, match_player: MatchPlayers })
      .from(Matches)
      .where(matches_sql)

    const matches_result = 

    // const result = (
    //   await this.db.db.execute(
    //     sql`
    //   select ${Matches}, ${Players}, ${MatchPlayers} from
    //     (select * from ${Matches} where ${and(...sql_chunks)} order by ${
    //       Matches.time_finished
    //     } desc${filters.limit_matches ? sql` limit ${filters.limit_matches}` : ``} offset ${
    //       filters.offset ?? 0
    //     })
    //   as ${Matches}
    //   inner join ${MatchPlayers} on ${Matches.id} = ${MatchPlayers.match_id}
    //   inner join ${Players} on ${MatchPlayers.player_id} = ${Players.id}
    //   `,
    //   )
    // ).rows as { Matches: string; Players: string; MatchPlayers: string }[]

    // convert lists to objects according to schema

    sentry.debug('result', JSON.stringify(result))

    const data = result.map(row => {
      sentry.debug('parse', JSON.parse(row.MatchPlayers)[0])
      return {
        match: Object.fromEntries(
          Object.keys(match_cols).map((col, i) => [col, JSON.parse(row.Matches)[i]]),
        ) as MatchSelect,
        player: Object.fromEntries(
          Object.keys(player_cols).map((col, i) => [col, JSON.parse(row.Players)[i]]),
        ) as PlayerSelect,
        match_player: Object.fromEntries(
          Object.keys(match_player_cols).map((col, i) => [col, JSON.parse(row.MatchPlayers)[i]]),
        ) as MatchPlayerSelect,
      }
    })

    sentry.debug('data', JSON.stringify(data))

    // const result = await query
    // Group results by match

    const matches = new Map<
      number,
      { match: Match; teams: { player: Player; match_player: MatchPlayerSelect }[][] }
    >()

    data.forEach(row => {
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

      sentry.debug('match', JSON.stringify(match.teams), row.match.team_players)

      match.teams[nonNullable(row.match_player.team_num, 'match_player.team_num')].push({
        player: new Player(row.player, this.db),
        match_player: row.match_player,
      })
    })

    return Array.from(matches.values())
  }
}

;[
  {
    match: {
      id: '(',
      ranking_id: '1',
      number: '5',
      team_players: '5',
      time_started: ',',
      time_finished: '1',
      outcome: '7',
      metadata: ',',
    },
    player: {
      id: '(',
      user_id: '3',
      ranking_id: '2',
      time_created: ',',
      name: '3',
      rating: '7',
      rd: '5',
      stats: '4',
    },
    match_player: {
      match_id: '(',
      player_id: '1',
      team_num: '5',
      rating_before: '5',
      rd_before: ',',
      time_created: '3',
    },
  },
  {
    match: {
      id: '(',
      ranking_id: '1',
      number: '5',
      team_players: '5',
      time_started: ',',
      time_finished: '1',
      outcome: '7',
      metadata: ',',
    },
    player: {
      id: '(',
      user_id: '3',
      ranking_id: '0',
      time_created: ',',
      name: '9',
      rating: '9',
      rd: '1',
      stats: '3',
    },
    match_player: {
      match_id: '(',
      player_id: '1',
      team_num: '5',
      rating_before: '5',
      rd_before: ',',
      time_created: '3',
    },
  },
  {
    match: {
      id: '(',
      ranking_id: '1',
      number: '5',
      team_players: '7',
      time_started: ',',
      time_finished: '1',
      outcome: '7',
      metadata: ',',
    },
    player: {
      id: '(',
      user_id: '3',
      ranking_id: '2',
      time_created: ',',
      name: '3',
      rating: '7',
      rd: '5',
      stats: '4',
    },
    match_player: {
      match_id: '(',
      player_id: '1',
      team_num: '5',
      rating_before: '7',
      rd_before: ',',
      time_created: '3',
    },
  },
  {
    match: {
      id: '(',
      ranking_id: '1',
      number: '5',
      team_players: '7',
      time_started: ',',
      time_finished: '1',
      outcome: '7',
      metadata: ',',
    },
    player: {
      id: '(',
      user_id: '3',
      ranking_id: '0',
      time_created: ',',
      name: '9',
      rating: '9',
      rd: '1',
      stats: '3',
    },
    match_player: {
      match_id: '(',
      player_id: '1',
      team_num: '5',
      rating_before: '7',
      rd_before: ',',
      time_created: '3',
    },
  },
  {
    match: {
      id: '(',
      ranking_id: '1',
      number: '5',
      team_players: '8',
      time_started: ',',
      time_finished: '1',
      outcome: '7',
      metadata: ',',
    },
    player: {
      id: '(',
      user_id: '3',
      ranking_id: '0',
      time_created: ',',
      name: '9',
      rating: '9',
      rd: '1',
      stats: '3',
    },
    match_player: {
      match_id: '(',
      player_id: '1',
      team_num: '5',
      rating_before: '8',
      rd_before: ',',
      time_created: '3',
    },
  },
  {
    match: {
      id: '(',
      ranking_id: '1',
      number: '5',
      team_players: '8',
      time_started: ',',
      time_finished: '1',
      outcome: '7',
      metadata: ',',
    },
    player: {
      id: '(',
      user_id: '3',
      ranking_id: '4',
      time_created: ',',
      name: '1',
      rating: '1',
      rd: '0',
      stats: '8',
    },
    match_player: {
      match_id: '(',
      player_id: '1',
      team_num: '5',
      rating_before: '8',
      rd_before: ',',
      time_created: '3',
    },
  },
  {
    match: {
      id: '(',
      ranking_id: '1',
      number: '5',
      team_players: '9',
      time_started: ',',
      time_finished: '1',
      outcome: '7',
      metadata: ',',
    },
    player: {
      id: '(',
      user_id: '3',
      ranking_id: '4',
      time_created: ',',
      name: '1',
      rating: '1',
      rd: '0',
      stats: '8',
    },
    match_player: {
      match_id: '(',
      player_id: '1',
      team_num: '5',
      rating_before: '9',
      rd_before: ',',
      time_created: '3',
    },
  },
  {
    match: {
      id: '(',
      ranking_id: '1',
      number: '5',
      team_players: '9',
      time_started: ',',
      time_finished: '1',
      outcome: '7',
      metadata: ',',
    },
    player: {
      id: '(',
      user_id: '3',
      ranking_id: '0',
      time_created: ',',
      name: '9',
      rating: '9',
      rd: '1',
      stats: '3',
    },
    match_player: {
      match_id: '(',
      player_id: '1',
      team_num: '5',
      rating_before: '9',
      rd_before: ',',
      time_created: '3',
    },
  },
  {
    match: {
      id: '(',
      ranking_id: '1',
      number: '6',
      team_players: '0',
      time_started: ',',
      time_finished: '1',
      outcome: '7',
      metadata: ',',
    },
    player: {
      id: '(',
      user_id: '3',
      ranking_id: '4',
      time_created: ',',
      name: '1',
      rating: '1',
      rd: '0',
      stats: '8',
    },
    match_player: {
      match_id: '(',
      player_id: '1',
      team_num: '6',
      rating_before: '0',
      rd_before: ',',
      time_created: '3',
    },
  },
  {
    match: {
      id: '(',
      ranking_id: '1',
      number: '6',
      team_players: '0',
      time_started: ',',
      time_finished: '1',
      outcome: '7',
      metadata: ',',
    },
    player: {
      id: '(',
      user_id: '3',
      ranking_id: '0',
      time_created: ',',
      name: '9',
      rating: '9',
      rd: '1',
      stats: '3',
    },
    match_player: {
      match_id: '(',
      player_id: '1',
      team_num: '6',
      rating_before: '0',
      rd_before: ',',
      time_created: '3',
    },
  },
]
