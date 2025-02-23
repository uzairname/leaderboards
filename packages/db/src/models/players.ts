import { and, eq, inArray, InferInsertModel, InferSelectModel, SQL, sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { Ranking, Team } from '.'
import { DbObjectManager } from '../classes'
import { DbClient } from '../client'
import { DbErrors } from '../errors'
import { Players, QueueTeams, TeamPlayers, Teams } from '../schema'
import { PartialRanking, Rating } from './rankings'
import { PartialUser } from './users'

export type PlayerSelect = InferSelectModel<typeof Players>
export type PlayerInsert = Omit<InferInsertModel<typeof Players>, 'id'>
export type PlayerUpdate = Partial<Omit<PlayerInsert, 'ranking_id' | 'user_id' | 'id'>>

export type PlayerStats = {}

export enum PlayerFlags {
  None = 0,
  Disabled = 1,
}

export class PartialPlayer {
  constructor(
    public data: { id: number },
    public db: DbClient,
  ) {}

  async fetch(): Promise<Player> {
    return this.db.players.fetch(this.data.id)
  }

  async ranking(): Promise<Ranking> {
    const ranking_id = (await this.fetch()).data.ranking_id
    return this.db.rankings.fetch(ranking_id)
  }

  async teams(): Promise<{ team: Team; in_queue: boolean }[]> {
    const data = await this.db.drizzle
      .select({ team: Teams, queue_team: QueueTeams })
      .from(Teams)
      .innerJoin(TeamPlayers, and(eq(TeamPlayers.team_id, Teams.id), eq(TeamPlayers.player_id, this.data.id)))
      .leftJoin(QueueTeams, eq(QueueTeams.team_id, Teams.id))

    return data.map(data => ({ team: new Team(data.team, this.db), in_queue: !!data.queue_team }))
  }

  async update(data: Partial<Omit<PlayerInsert, 'user_id' | 'ranking_id'>>): Promise<Player> {
    const new_data = (
      await this.db.drizzle
        .update(Players)
        .set(data)
        .where(
          eq(Players.id, this.data.id),
        )
        .returning()
    )[0] // prettier-ignore
    this.data = new_data
    return new Player(new_data, this.db)
  }

  async removeTeamsFromQueue(): Promise<number> {
    const result = await this.db.drizzle
      .delete(QueueTeams)
      .where(
        sql`${QueueTeams.team_id} in (
          select ${TeamPlayers.team_id} from ${TeamPlayers}
          where ${TeamPlayers.player_id} = ${this.data.id}
        )`,
      )
      .returning() // prettier-ignore
    return result.length
  }
}

export class Player extends PartialPlayer {
  constructor(
    public data: PlayerSelect,
    public db: DbClient,
  ) {
    super({ id: data.id }, db)
    db.cache.players.set(data.id, this)
    // Set without checking it exists so that on update(), the cache gets updated
    db.cache.players_by_ranking_user.set(data.ranking_id, this, data.user_id)
  }

  toString() {
    return `[Player ${this.data.id}: ${this.data.name} in ${this.data.ranking_id}]`
  }
}

export class PlayersManager extends DbObjectManager {
  async create(
    user: PartialUser,
    ranking: PartialRanking,
    data: Omit<PlayerInsert, 'user_id' | 'ranking_id'>,
  ): Promise<Player> {
    const new_data = (
      await this.db.drizzle
        .insert(Players)
        .values({ user_id: user.data.id, ranking_id: ranking.data.id, ...data })
        .returning()
    )[0]
    return new Player(new_data, this.db)
  }

  get(id: number): PartialPlayer {
    return new PartialPlayer({ id }, this.db)
  }

  async fetch(id: number): Promise<Player> {
    if (this.db.cache.players.has(id)) return this.db.cache.players.get(id)!
    const data = (await this.db.drizzle.select().from(Players).where(eq(Players.id, id)))[0]
    if (!data) throw new DbErrors.NotFound(`Player ${id} doesn't exist`)
    return new Player(data, this.db)
  }

  async fetchByUserRanking(user_id: string, ranking: PartialRanking): Promise<Player | undefined> {
    const cached_player = this.db.cache.players_by_ranking_user.get(ranking.data.id, user_id)
    if (cached_player) return cached_player

    const data = (
      await this.db.drizzle
        .select()
        .from(Players)
        .where(and(eq(Players.user_id, user_id), eq(Players.ranking_id, ranking.data.id)))
    )[0]
    if (!data) return
    return new Player(data, this.db)
  }

  async fetchMany({
    allow_disabled = false,
    ranking_id,
  }: {
    allow_disabled?: boolean
    in_queue?: boolean
    ranking_id?: number
  } = {}): Promise<Player[]> {
    const where_chunks: SQL[] = []

    if (ranking_id) where_chunks.push(eq(Players.ranking_id, ranking_id))
    if (!allow_disabled) where_chunks.push(sql`(${Players.flags} & ${PlayerFlags.Disabled}) = 0`)

    const players = await this.db.drizzle
      .select()
      .from(Players)
      .where(and(...where_chunks))

    return players.map(item => {
      return new Player(item, this.db)
    })
  }

  async updateMany(ids: number[], data: PlayerUpdate) {
    await this.db.drizzle.update(Players).set(data).where(inArray(Players.id, ids))
  }

  async updateRatings(data: { player: PartialPlayer; rating: Rating }[]) {
    this.db.cache.match_players.clear()
    this.db.cache.players.clear()
    this.db.cache.players_by_ranking_user.clear()

    if (data.length === 0) return

    const player_ids = data.map(p => p.player.data.id)
    const ratings = data.map(p => `'${JSON.stringify(p.rating)}'`)

    const pg_dialect = new PgDialect()

    const query =
      `with values as (
      SELECT * 
        FROM UNNEST(
            ARRAY[${player_ids.join(',')}],
            ARRAY[${ratings.join(',')}]::jsonb[]
        ) AS v(a, b)` +
      pg_dialect.sqlToQuery(sql`
      )
      update ${Players}
      set 
        rating = values.b
      from values
      where ${Players.id} = values.a
      `).sql

    await this.db.drizzle.execute(query)
  }
}
