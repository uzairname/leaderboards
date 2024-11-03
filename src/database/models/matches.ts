import {
  InferInsertModel,
  InferSelectModel,
  SQL,
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  sql,
} from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { Player } from '.'
import { sentry } from '../../logging/sentry'
import { DbClient } from '../client'
import { DbErrors } from '../errors'
import { DbObject, DbObjectManager } from '../managers'
import { GuildRankings, MatchPlayers, MatchSummaryMessages, Matches, Players } from '../schema'
import { PartialGuild } from './guilds'
import { PartialPlayer, PlayerSelect } from './players'
import { PartialRanking } from './rankings'
import { PartialUser } from './users'

export type MatchMetadata = {
  best_of: number
}

export enum Vote {
  Undecided = 0,
  Win = 1,
  Loss = 2,
  Draw = 3,
  Cancel = 4,
}

export enum MatchStatus {
  Finished = 0,
  Ongoing = 1,
  Canceled = 2,
}

export type MatchSelect = InferSelectModel<typeof Matches>
export type MatchInsert = Omit<InferInsertModel<typeof Matches>, 'id' | 'number'>
export type MatchUpdate = Partial<Omit<MatchInsert, 'ranking_id'>>

export type MatchSummaryMessageSelect = InferSelectModel<typeof MatchSummaryMessages>

export type MatchPlayerSelect = InferSelectModel<typeof MatchPlayers>
export type MatchPlayerInsert = InferInsertModel<typeof MatchPlayers>

export type MatchPlayer = { player: Player } & Omit<
  MatchPlayerSelect,
  'match_id' | 'player_id' | 'team_num'
>

export class Match implements DbObject<MatchSelect> {
  constructor(
    public data: MatchSelect,
    public db: DbClient,
  ) {
    this.db.cache.matches.set(this.data.id, this)
  }

  toString() {
    return `[Match ${this.data.id}: ${JSON.stringify({
      status: this.data.status,
      outcome: this.data.outcome,
      ranking_id: this.data.ranking_id,
      votes: this.data.team_votes,
    })}]`
  }

  get ranking(): PartialRanking {
    return this.db.rankings.get(this.data.ranking_id)
  }

  async players(): Promise<MatchPlayer[][]> {
    if (this.db.cache.match_players.has(this.data.id))
      return this.db.cache.match_players.get(this.data.id)!

    const result = await this.db.drizzle
      .select({ player: Players, match_player: MatchPlayers })
      .from(MatchPlayers)
      .where(eq(MatchPlayers.match_id, this.data.id))
      .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))

    const team_players = await this.convertPlayersQueryResult(result)
    if (!team_players)
      throw new DbErrors.NotFound(`Not all players found for match ${this.data.id}`)

    return team_players
  }

  async getSummaryMessage(guild_id: string): Promise<MatchSummaryMessageSelect | undefined> {
    const data = (
      await this.db.drizzle
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

  async update(data: MatchUpdate): Promise<Match> {
    const new_data = (
      await this.db.drizzle
        .update(Matches)
        .set({
          ...data,
        })
        .where(eq(Matches.id, this.data.id))
        .returning()
    )[0]
    this.data = new_data
    return new Match(new_data, this.db)
  }

  async updateSummaryMessage(
    guild_id: string,
    channel_id: string,
    message_id: string,
  ): Promise<void> {
    try {
      // try to insert
      await this.db.drizzle.insert(MatchSummaryMessages).values({
        match_id: this.data.id,
        guild_id,
        channel_id,
        message_id,
      })
    } catch (e) {
      // duplicate key. update
      await this.db.drizzle
        .update(MatchSummaryMessages)
        .set({
          message_id,
        })
        .where(
          and(
            eq(MatchSummaryMessages.match_id, this.data.id),
            eq(MatchSummaryMessages.guild_id, guild_id),
          ),
        )
    }
  }

  async updatePlayerRatingsBefore(team_players: MatchPlayer[][]): Promise<this> {
    await Promise.all(
      team_players.flat().map(async player => {
        sentry.debug(
          `updating player rating before for ${player.player.data.id} in match ${this.data.id}`,
        )
        await this.db.drizzle
          .update(MatchPlayers)
          .set({
            rating: player.rating,
          })
          .where(
            and(
              eq(MatchPlayers.match_id, this.data.id),
              eq(MatchPlayers.player_id, player.player.data.id),
            ),
          )
      }),
    )

    this.db.cache.match_players.delete(this.data.id)

    return this
  }

  async delete(): Promise<void> {
    await this.db.drizzle.delete(Matches).where(eq(Matches.id, this.data.id))
    this.db.cache.matches.delete(this.data.id)
    this.db.cache.match_players.delete(this.data.id)
  }

  /**
   * For the result of a select query, returns an array of team players
   * If some match players are missing from the database, returns null
   */
  async convertPlayersQueryResult(
    query_result: { player: PlayerSelect; match_player: MatchPlayerSelect }[],
  ): Promise<MatchPlayer[][] | null> {
    const ranking = await this.db.rankings.fetch(query_result[0].player.ranking_id)

    const team_players = Array.from(
      { length: ranking.data.teams_per_match },
      () => [] as MatchPlayer[],
    )

    query_result.forEach(row => {
      team_players[row.match_player.team_num].push({
        player: new Player(row.player, this.db),
        rating: row.match_player.rating,
        flags: row.match_player.flags,
      })
    })

    if (
      team_players.some(team => team.length !== ranking.data.players_per_team) ||
      team_players.length !== ranking.data.teams_per_match
    ) {
      // Some team teams or players are missing from the database.
      throw new DbErrors.MissingMatchPlayers()
    }

    const match_id = query_result[0].match_player.match_id
    this.db.cache.match_players.set(match_id, team_players)

    return team_players
  }
}

export class MatchesManager extends DbObjectManager {
  async create(
    data: Readonly<
      { ranking: PartialRanking; team_players: MatchPlayer[][] } & Omit<MatchInsert, 'ranking_id'>
    >,
  ): Promise<Match> {
    const data_copy = { ...data }

    // set default time started and finished values
    if (data_copy.status === MatchStatus.Finished) {
      data_copy.time_finished = data_copy.time_finished ?? data_copy.time_started ?? new Date()
    } else {
      data_copy.time_finished = null
    }

    data_copy.time_started = data_copy.time_started ?? data_copy.time_finished ?? new Date()

    sentry.debug(`creating match with data: ${Object.keys(data_copy)}`)

    const new_match_data = (
      await this.db.drizzle
        .insert(Matches)
        .values({
          ...data_copy,
          ranking_id: data_copy.ranking.data.id,
        })
        .returning()
    )[0]

    const new_match = new Match(new_match_data, this.db)

    const match_players_data = data_copy.team_players
      .map((team, team_num) => {
        return team.map(p => {
          return {
            match_id: new_match_data.id,
            player_id: p.player.data.id,
            team_num,
            ...p,
          }
        })
      })
      .flat()

    // insert new MatchPlayers
    await this.db.drizzle.insert(MatchPlayers).values(match_players_data).returning()

    return new_match
  }

  // returns matches that are from a ranking in this guild.
  async fetch(id: number, limit_to_guild?: string): Promise<Match> {
    const cached = this.db.cache.matches.get(id)
    if (cached && !limit_to_guild) return cached

    const query = this.db.drizzle.select({ match: Matches }).from(Matches)

    if (limit_to_guild) {
      query
        .innerJoin(GuildRankings, eq(Matches.ranking_id, GuildRankings.ranking_id))
        .where(and(eq(Matches.id, id), eq(GuildRankings.guild_id, limit_to_guild)))
    } else {
      query.where(eq(Matches.id, id))
    }

    const data = (await query)[0]

    if (!data) {
      throw new DbErrors.NotFound(`Match ${id} doesn't exist`)
    }

    return new Match(data.match, this.db)
  }

  /**
   * Returns a list of matches, in order of in order of oldest to most recent.
   *
   * earlient_first: Determines the order to use when applying limit and offset.
   *  Final result is always ascending by time_finished, time_started.
   */
  async getMany(filters: {
    finished_at_or_after?: Date | null
    status?: MatchStatus
    rankings?: PartialRanking[]
    players?: PartialPlayer[]
    users?: PartialUser[]
    guild?: PartialGuild
    limit?: number
    offset?: number
    earliest_first?: boolean
  }): Promise<{ match: Match; team_players: MatchPlayer[][] }[]> {
    const conditions: SQL[] = []

    if (filters.finished_at_or_after) {
      // subtract 1 second to include the matches that finished at the exact time
      const finished_at_or_after = new Date(filters.finished_at_or_after)
      finished_at_or_after.setSeconds(finished_at_or_after.getSeconds() - 1)
      conditions.push(gte(Matches.time_finished, finished_at_or_after))
    }

    if (filters.status) conditions.push(eq(Matches.status, filters.status))

    if (filters.rankings)
      conditions.push(
        inArray(
          Matches.ranking_id,
          filters.rankings.map(r => r.data.id),
        ),
      )

    if (filters.players)
      conditions.push(
        inArray(
          MatchPlayers.player_id,
          filters.players.map(p => p.data.id),
        ),
      )

    if (filters.users)
      conditions.push(
        inArray(
          Players.user_id,
          filters.users.map(u => u.data.id),
        ),
      )

    if (filters.guild) conditions.push(eq(GuildRankings.guild_id, filters.guild.data.id))

    const where_sql = and(...conditions)

    const filtered_matches = this.db.drizzle
      .select({ _: Matches.id })
      .from(Matches)
      .innerJoin(MatchPlayers, eq(Matches.id, MatchPlayers.match_id))
      .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))
      .innerJoin(GuildRankings, eq(Matches.ranking_id, GuildRankings.ranking_id))
      .where(where_sql)

    const paged_matches = this.db.drizzle
      .select({ id: Matches.id })
      .from(Matches)
      .where(inArray(Matches.id, filtered_matches))
      // desc(Matches.time_finished), desc(Matches.time_started))
      .orderBy(
        // (filters.earliest_first ? asc : desc)(Matches.time_finished),
        // (filters.earliest_first ? asc : desc)(Matches.time_started)
        (filters.earliest_first ? asc : desc)(
          sql`coalesce(${Matches.time_finished}, ${Matches.time_started})`,
        ),
      )
      .limit(filters.limit ?? -1)
      .offset(filters.offset ?? 0)
      .as('paged')

    const final_query = this.db.drizzle
      .select({ player: Players, match: Matches, match_player: MatchPlayers })
      .from(paged_matches)
      .innerJoin(Matches, eq(Matches.id, paged_matches.id))
      .innerJoin(MatchPlayers, eq(Matches.id, MatchPlayers.match_id))
      .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))
      // .orderBy(asc(Matches.time_finished), asc(Matches.time_started))
      .orderBy(asc(sql`coalesce(${Matches.time_finished}, ${Matches.time_started})`))

    const result = await final_query

    console.log(result)

    const match_ids = Array.from(new Set(result.map(r => r.match.id)))

    const matches = await Promise.all(
      match_ids.map(async match_id => {
        const match_players = result.filter(r => r.match.id === match_id)
        const match = new Match(match_players[0].match, this.db)
        try {
          // Save the players in this match. If they don't exist, delete the match later and retry the query
          const team_players = await match.convertPlayersQueryResult(match_players)
          return { match, team_players }
        } catch (e) {
          if (e instanceof DbErrors.MissingMatchPlayers) return { match, team_players: null }
          throw e
        }
      }),
    )

    if (matches.some(m => m.team_players === null)) {
      // Some team players are missing from the database. Delete those matches and retry the query
      const invalid_teams_match_ids = matches
        .filter(m => m.team_players === null)
        .map(m => m.match.data.id)
      await this.db.drizzle.delete(Matches).where(inArray(Matches.id, invalid_teams_match_ids))
      return this.getMany(filters)
    } else {
      return matches as { match: Match; team_players: MatchPlayer[][] }[]
    }
  }

  async updateMatchPlayers(
    match_players: { match_id: number; player: MatchPlayer }[],
  ): Promise<void> {
    sentry.debug(`updating ${match_players.length} match players`)
    if (match_players.length === 0) return

    const match_ids = match_players.map(mp => mp.match_id)
    const player_ids = match_players.map(mp => mp.player.player.data.id)
    const ratings = match_players.map(mp => `'${JSON.stringify(mp.player.rating)}'`)
    const flags = match_players.map(mp => mp.player.flags)

    const pg_dialect = new PgDialect()

    const query =
      `with values as (
      SELECT * 
        FROM UNNEST(
            ARRAY[${match_ids.join(',')}],
            ARRAY[${player_ids.join(',')}],
            ARRAY[${ratings.join(',')}]::jsonb[],
            ARRAY[${flags.join(',')}]
        ) AS v(a,b,c,d)` +
      pg_dialect.sqlToQuery(sql`
      )
      update ${MatchPlayers}
      set 
        rating = values.c,
        flags = values.d
      from values
      where ${MatchPlayers.match_id} = values.a
      and ${MatchPlayers.player_id} = values.b
      `).sql

    await this.db.drizzle.execute(query)
  }
}
