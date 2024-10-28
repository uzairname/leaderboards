import { InferInsertModel, InferSelectModel, SQL, and, asc, eq, inArray, sql } from 'drizzle-orm'
import { Player, Ranking } from '.'
import { sentry } from '../../logging/sentry'
import { DbClient } from '../client'
import { DbErrors } from '../errors'
import { DbObject, DbObjectManager } from '../managers'
import { MatchPlayers, MatchSummaryMessages, Matches, Players } from '../schema'

export type MatchMetadata = {
  best_of: number
}

export enum Vote {
  Undecided = 0,
  Win = 1,
  Loss = 2,
  Draw = 3,
}

export enum MatchStatus {
  Finished = 0,
  Ongoing = 1,
}

export type MatchSelect = InferSelectModel<typeof Matches>
export type MatchInsert = Omit<InferInsertModel<typeof Matches>, 'id' | 'number'>
export type MatchUpdate = Partial<Omit<MatchInsert, 'ranking_id'>>

export type MatchSummaryMessageSelect = InferSelectModel<typeof MatchSummaryMessages>

export type MatchPlayerSelect = InferSelectModel<typeof MatchPlayers>
export type MatchPlayerInsert = InferInsertModel<typeof MatchPlayers>

export type MatchTeamPlayer = { player: Player } & Omit<
  MatchPlayerSelect,
  'match_id' | 'player_id' | 'team_num'
>

export class Match extends DbObject<MatchSelect> {
  constructor(data: MatchSelect, db: DbClient) {
    super(data, db)
    db.cache.matches[data.id] = this
  }

  async ranking(): Promise<Ranking> {
    return this.db.rankings.get(this.data.ranking_id)
  }

  async teamPlayers(): Promise<MatchTeamPlayer[][]> {
    if (this.db.cache.match_team_players[this.data.id]) {
      sentry.debug(`cache hit for match team players ${this.data.id}`)
      return this.db.cache.match_team_players[this.data.id]
    }

    const result = await this.db.drizzle
      .select({ player: Players, match_player: MatchPlayers })
      .from(MatchPlayers)
      .where(eq(MatchPlayers.match_id, this.data.id))
      .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))

    // calculate number of teams
    const num_teams = new Set(result.map(p => p.match_player.team_num)).size

    // create a 2d array based on each players team index
    const team_players = Array.from({ length: num_teams }, () => [] as MatchTeamPlayer[])

    result.forEach(row => {
      team_players[row.match_player.team_num].push({
        player: new Player(row.player, this.db),
        rating_before: row.match_player.rating_before,
        rd_before: row.match_player.rd_before,
      })
    })

    this.db.cache.match_team_players[this.data.id] = team_players

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

  async updateSummaryMessage(guild_id: string, message_id: string): Promise<void> {
    try {
      // try to insert
      await this.db.drizzle.insert(MatchSummaryMessages).values({
        match_id: this.data.id,
        guild_id: guild_id,
        message_id: message_id,
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

  async update(data: MatchUpdate): Promise<this> {
    this.data = (
      await this.db.drizzle
        .update(Matches)
        .set({
          ...data,
        })
        .where(eq(Matches.id, this.data.id))
        .returning()
    )[0]

    this.db.cache.matches[this.data.id] = this

    return this
  }

  async updatePlayerRatingsBefore(team_players: MatchTeamPlayer[][]): Promise<this> {
    await Promise.all(
      team_players.flat().map(player =>
        this.db.drizzle
          .update(MatchPlayers)
          .set({
            rating_before: player.rating_before,
            rd_before: player.rd_before,
          })
          .where(
            and(
              eq(MatchPlayers.match_id, this.data.id),
              eq(MatchPlayers.player_id, player.player.data.id),
            ),
          ),
      ),
    )

    delete this.db.cache.match_team_players[this.data.id]

    return this
  }

  async delete(): Promise<void> {
    await this.db.drizzle.delete(Matches).where(eq(Matches.id, this.data.id))
    delete this.db.cache.matches[this.data.id]
  }
}

export class MatchesManager extends DbObjectManager {
  async create(
    data: { ranking: Ranking; team_players: MatchTeamPlayer[][] } & Omit<MatchInsert, 'ranking_id'>,
  ): Promise<Match> {
    const data_copy = { ...data }

    // set default time started and finished values
    if (data_copy.status === MatchStatus.Finished) {
      data_copy.time_finished = data_copy.time_finished ?? data_copy.time_started ?? new Date()
    } else {
      data_copy.time_finished = null
    }

    data_copy.time_started = data_copy.time_started ?? data_copy.time_finished ?? new Date()

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

  async get(id: number): Promise<Match> {
    if (this.db.cache.matches[id]) {
      sentry.debug(`cache hit for match ${id}`)
      return this.db.cache.matches[id]
    }

    const data = (await this.db.drizzle.select().from(Matches).where(eq(Matches.id, id)))[0]

    if (!data) {
      throw new DbErrors.NotFoundError(`Match ${id} doesn't exist`)
    }

    return new Match(data, this.db)
  }

  async getMany(filters: {
    player_ids?: number[]
    user_ids?: string[]
    ranking_ids?: number[]
    finished_on_or_after?: Date
    limit?: number
    offset?: number
    status?: MatchStatus
  }): Promise<{ match: Match; team_players: MatchTeamPlayer[][] }[]> {
    const where_sql_chunks: SQL[] = []

    if (filters.player_ids) {
      where_sql_chunks.push(sql`${Matches.id} in (
        select ${MatchPlayers.match_id} from ${MatchPlayers} 
        where ${MatchPlayers.player_id} in ${filters.player_ids}
      )`)
    }

    if (filters.user_ids) {
      where_sql_chunks.push(sql`${Matches.id} in (
        select ${MatchPlayers.match_id} from ${MatchPlayers}
        inner join ${Players} on ${Players.id} = ${MatchPlayers.player_id}
        where ${Players.user_id} in ${filters.user_ids}
      )`)
    }

    if (filters.ranking_ids) {
      where_sql_chunks.push(inArray(Matches.ranking_id, filters.ranking_ids))
    }

    if (filters.finished_on_or_after) {
      where_sql_chunks.push(sql`${Matches.time_finished} >= ${filters.finished_on_or_after}`)
    }

    if (filters.status !== undefined) {
      where_sql_chunks.push(eq(Matches.status, filters.status))
    }

    const select_where_sql_chunks = [
      sql`select ${Matches.id} from ${Matches} where ${and(...where_sql_chunks)}
      order by ${Matches.time_started} desc`,
    ]

    if (filters.limit) {
      select_where_sql_chunks.push(sql` limit ${filters.limit}`)
    }

    if (filters.offset) {
      select_where_sql_chunks.push(sql` offset ${filters.offset}`)
    }

    const matches_sql = sql`
      ${Matches.id} in (${sql.join(select_where_sql_chunks)})
    `

    const result = await this.db.drizzle
      .select({ match: Matches, player: Players, match_player: MatchPlayers })
      .from(Matches)
      .innerJoin(MatchPlayers, eq(Matches.id, MatchPlayers.match_id))
      .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))
      .where(matches_sql)
      .orderBy(asc(Matches.time_finished))

    const matches = new Map<number, { match: Match; team_players: MatchTeamPlayer[][] }>()

    result.forEach(row => {
      const match_id = row.match.id

      if (!matches.has(match_id)) {
        // initialize an empty match element

        const num_teams = new Set(
          result.filter(r => r.match.id === match_id).map(r => r.match_player.team_num),
        ).size

        matches.set(match_id, {
          match: new Match(row.match, this.db),
          team_players: Array.from({ length: num_teams }, () => [] as MatchTeamPlayer[]),
        })
      }

      const match = matches.get(match_id)!

      match.team_players[row.match_player.team_num].push({
        player: new Player(row.player, this.db),
        rating_before: row.match_player.rating_before,
        rd_before: row.match_player.rd_before,
      })
    })

    matches.forEach(match => {
      this.db.cache.match_team_players[match.match.data.id] = match.team_players
    })

    return Array.from(matches.values())
  }
}
