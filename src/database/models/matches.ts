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
} from 'drizzle-orm'
import { Player, Ranking } from '.'
import { sentry } from '../../logging/sentry'
import { DbClient } from '../client'
import { DbErrors } from '../errors'
import { DbObject, DbObjectManager } from '../managers'
import { GuildRankings, MatchPlayers, MatchSummaryMessages, Matches, Players } from '../schema'
import { PlayerSelect } from './players'

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
  Scored = 0,
  Ongoing = 1,
  Canceled = 2,
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

  toString() {
    return `[Match ${this.data.id}: ranking ${this.data.time_started?.getDate() ?? this.data.time_finished?.getDate()}]`
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

    const team_players = await this.convertTeamPlayers(result)
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
    delete this.db.cache.match_team_players[this.data.id]
  }

  /**
   * For the result of a select query, returns an array of team players
   * If some match players are missing from the database, returns null
   */
  async convertTeamPlayers(
    query_result: { player: PlayerSelect; match_player: MatchPlayerSelect }[],
  ): Promise<MatchTeamPlayer[][] | null> {
    const ranking = await this.db.rankings.get(query_result[0].player.ranking_id)
    const num_teams = ranking.data.num_teams
    const players_per_team = ranking.data.players_per_team

    const team_players = Array.from({ length: num_teams }, () => [] as MatchTeamPlayer[])

    query_result.forEach(row => {
      team_players[row.match_player.team_num].push({
        player: new Player(row.player, this.db),
        rating_before: row.match_player.rating_before,
        rd_before: row.match_player.rd_before,
        flags: row.match_player.flags,
      })
    })

    if (
      team_players.some(team => team.length !== players_per_team) ||
      team_players.length !== num_teams
    ) {
      // Some team teams or players are missing from the database.
      return null
    }

    const match_id = query_result[0].match_player.match_id
    this.db.cache.match_team_players[match_id] = team_players

    return team_players
  }
}

export class MatchesManager extends DbObjectManager {
  async create(
    data: Readonly<{ ranking: Ranking; team_players: MatchTeamPlayer[][] } & Omit<MatchInsert, 'ranking_id'>>,
  ): Promise<Match> {
    const data_copy = { ...data }

    // set default time started and finished values
    if (data_copy.status === MatchStatus.Scored) {
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

  // returns matches that are from a ranking in this guild.
  async get(id: number, limit_to_guild?: string): Promise<Match> {
    const cached = this.db.cache.matches[id]
    if (cached && !limit_to_guild) {
      sentry.debug(`cache hit for ${cached}`)
      return cached
    }

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
   * Returns a list of matches, in order of in order of oldest to most recent
   */
  async getMany(filters: {
    finished_at_or_after?: Date
    status?: MatchStatus
    ranking_ids?: number[]
    player_ids?: number[]
    user_ids?: string[]
    guild_id?: string
    limit?: number
    offset?: number
  }): Promise<{ match: Match; team_players: MatchTeamPlayer[][] }[]> {
    sentry.debug(`getMany matches with filters: ${JSON.stringify(filters)}`)

    const conditions: SQL[] = []

    if (filters.finished_at_or_after)
      conditions.push(gte(Matches.time_finished, filters.finished_at_or_after))

    if (filters.status) conditions.push(eq(Matches.status, filters.status))

    if (filters.ranking_ids) conditions.push(inArray(Matches.ranking_id, filters.ranking_ids))

    if (filters.player_ids) conditions.push(inArray(MatchPlayers.player_id, filters.player_ids))

    if (filters.user_ids) conditions.push(inArray(Players.user_id, filters.user_ids))

    if (filters.guild_id) conditions.push(eq(GuildRankings.guild_id, filters.guild_id))

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
      .orderBy(desc(Matches.time_finished), desc(Matches.time_started))
      .limit(filters.limit ?? -1)
      .offset(filters.offset ?? 0)
      .as('paged')

    const final_query = this.db.drizzle
      .select({ player: Players, match: Matches, match_player: MatchPlayers })
      .from(paged_matches)
      .innerJoin(Matches, eq(Matches.id, paged_matches.id))
      .innerJoin(MatchPlayers, eq(Matches.id, MatchPlayers.match_id))
      .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))
      .orderBy(asc(Matches.time_finished), asc(Matches.time_started))

    const result = await final_query

    const match_ids = Array.from(new Set(result.map(r => r.match.id)))

    const matches = await Promise.all(
      match_ids.map(async match_id => {
        const match_players = result.filter(r => r.match.id === match_id)
        const match = new Match(match_players[0].match, this.db)

        const team_players = await match.convertTeamPlayers(match_players)

        return { match, team_players }
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
      return matches as { match: Match; team_players: MatchTeamPlayer[][] }[]
    }
  }
}
