import { and, eq, sql, desc, inArray, SQL, asc } from 'drizzle-orm'
import { Player, Ranking } from '..'
import { sentry } from '../../../request/sentry'
import { nonNullable } from '../../../utils/utils'
import { DbClient } from '../../client'
import { DbErrors } from '../../errors'
import { DbObject, DbObjectManager } from '../../managers'
import { MatchPlayers, MatchSummaryMessages, Matches, Players } from '../../schema'
import {
  MatchInsert,
  MatchPlayerSelect,
  MatchSelect,
  MatchSummaryMessageSelect,
  MatchUpdate,
} from '../../types'

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

  async summaryMessage(guild_id: string): Promise<MatchSummaryMessageSelect | undefined> {
    const data = (
      await this.db.db
        .select()
        .from(MatchSummaryMessages)
        .where(
          and(
            eq(MatchSummaryMessages.match_id, this.data.id),
            eq(MatchSummaryMessages.guild_id, guild_id),
          ),
        )
    )[0]
    return data
  }

  async update(
    data: Partial<
      { team_players: { id: number; rating_before: number; rd_before: number }[][] } & Omit<
        MatchUpdate,
        'team_players' | 'number'
      >
    >,
  ): Promise<this> {
    this.data = (
      await this.db.db
        .update(Matches)
        .set({
          ...data,
          team_players: data.team_players?.map(team => team.map(player => player.id)),
        })
        .where(eq(Matches.id, this.data.id))
        .returning()
    )[0]

    // update all match players' ratings and rd before
    if (data.team_players) {
      await this.updateMatchPlayers(data.team_players)
    }

    return this
  }

  async updateMatchPlayers(
    team_players: { id: number; rating_before: number; rd_before: number }[][],
  ): Promise<this> {
    sentry.debug(
      `updating match players for match ${this.data.id}, ${JSON.stringify(
        team_players.map(t => t.map(p => p.rating_before)),
      )}`,
    )
    await Promise.all(
      team_players.flat().map(player =>
        this.db.db
          .update(MatchPlayers)
          .set({
            rating_before: player.rating_before,
            rd_before: player.rd_before,
          })
          .where(
            and(eq(MatchPlayers.match_id, this.data.id), eq(MatchPlayers.player_id, player.id)),
          ),
      ),
    )
    return this
  }

  async delete(): Promise<void> {
    await this.db.db.delete(Matches).where(eq(Matches.id, this.data.id))
    delete this.db.cache.matches[this.data.id]
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

  async get(id: number): Promise<Match> {
    if (this.db.cache.matches[id]) {
      return this.db.cache.matches[id]
    }

    const data = (await this.db.db.select().from(Matches).where(eq(Matches.id, id)))[0]

    if (!data) {
      throw new DbErrors.NotFoundError(`Match ${id} doesn't exist`)
    }

    return new Match(data, this.db)
  }

  async getMany(filters: {
    player_ids?: number[]
    user_ids?: string[]
    ranking_ids?: number[]
    on_or_after?: Date
    limit_matches?: number
    offset?: number
  }): Promise<{ match: Match; teams: { player: Player; match_player: MatchPlayerSelect }[][] }[]> {
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
        inner join ${Players} on ${Players.id} = ${MatchPlayers.player_id}
        where ${Players.user_id} in ${filters.user_ids}
      )`)
    }

    if (filters.ranking_ids) {
      sql_chunks.push(inArray(Matches.ranking_id, filters.ranking_ids))
    }

    if (filters.on_or_after) {
      sql_chunks.push(sql`${Matches.time_finished} >= ${filters.on_or_after}`)
    }

    sentry.debug(`sql_chunks: ${sql_chunks}`, `and(...sql_chunks): ${and(...sql_chunks)}`)

    const matches_sql_chunks = [
      sql`select ${Matches.id} from ${Matches} where ${and(...sql_chunks)} order by ${
        Matches.time_finished
      } desc`,
    ]

    if (filters.limit_matches) {
      matches_sql_chunks.push(sql` limit ${filters.limit_matches}`)
    }

    if (filters.offset) {
      matches_sql_chunks.push(sql` offset ${filters.offset}`)
    }

    const matches_sql = sql`
      ${Matches.id} in (${sql.join(matches_sql_chunks)})
    `

    const result = await this.db.db
      .select({ match: Matches, player: Players, match_player: MatchPlayers })
      .from(Matches)
      .innerJoin(MatchPlayers, eq(Matches.id, MatchPlayers.match_id))
      .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))
      .where(matches_sql)
      .orderBy(asc(Matches.time_finished))

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
