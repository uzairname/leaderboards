import { and, eq, inArray, InferInsertModel, InferSelectModel, SQL, sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { Ranking, Team } from '.'
import { DbObjectManager } from '../classes'
import { DbClient } from '../client'
import { DbErrors } from '../errors'
import { Players, TeamPlayers, Teams } from '../schema'
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

  async teams(): Promise<Team[]> {
    const data = await this.db.drizzle
      .select({ team: Teams })
      .from(Teams)
      .innerJoin(TeamPlayers, and(eq(TeamPlayers.team_id, Teams.id), eq(TeamPlayers.player_id, this.data.id)))

    return data.map(data => new Team(data.team, this.db))
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
    throw new Error('Method not implemented.')
  }
}

export class Player extends PartialPlayer {
  constructor(
    public data: PlayerSelect,
    public db: DbClient,
  ) {
    super({ id: data.id }, db)
    db.cache.players.set(data.id, this)
  }

  toString() {
    return `[Player ${this.data.id}: ${this.data.name} in ${this.data.ranking_id}]`
  }
}

export class UserPlayer extends Player {
  constructor(
    public data: PlayerSelect & { user_id: string },
    public db: DbClient,
  ) {
    super(data, db)
    if (data.user_id !== null) db.cache.user_players.set(data.ranking_id, this, data.user_id)
  }
}

export class PlayersManager extends DbObjectManager {
  async create(
    data: {
      ranking: PartialRanking
      user?: PartialUser
    } & Omit<PlayerInsert, 'user_id' | 'ranking_id'>,
  ): Promise<Player> {
    if (data.role_id !== undefined && data.guild_id === undefined) {
      throw new DbErrors.ValueError('Guild id is required when role id is provided')
    }
    const new_data = (
      await this.db.drizzle
        .insert(Players)
        .values({ ranking_id: data.ranking.data.id, ...data })
        .returning()
    )[0]
    return new Player(new_data, this.db)
  }

  async createWithUser(
    user: PartialUser,
    ranking: PartialRanking,
    data: Omit<PlayerInsert, 'user_id' | 'ranking_id'>,
  ): Promise<UserPlayer> {
    const new_data = (
      await this.db.drizzle
        .insert(Players)
        .values({ user_id: user.data.id, ranking_id: ranking.data.id, ...data })
        .returning()
    )[0]
    return new UserPlayer({ ...new_data, user_id: user.data.id }, this.db)
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

  async fetchByUser({
    user_id,
    ranking,
  }: {
    user_id: string
    ranking: PartialRanking
  }): Promise<UserPlayer | undefined> {
    const cached_player = this.db.cache.user_players.get(ranking.data.id, user_id)
    if (cached_player) return cached_player

    const data = (
      await this.db.drizzle
        .select()
        .from(Players)
        .where(and(eq(Players.user_id, user_id), eq(Players.ranking_id, ranking.data.id)))
    )[0]
    if (!data) return
    return new UserPlayer({ ...data, user_id }, this.db)
  }

  async fetchBy({
    ranking,
    user_id,
    role_id,
    name,
  }: {
    ranking: PartialRanking
    user_id?: string
    role_id?: string
    name?: string
  }): Promise<Player | undefined> {
    const where_chunks: SQL[] = []
    if (user_id) where_chunks.push(eq(Players.user_id, user_id))
    if (role_id) where_chunks.push(eq(Players.role_id, role_id))
    if (name) where_chunks.push(eq(Players.name, name))
    if (where_chunks.length === 0) throw new DbErrors.ValueError('No filters provided')

    where_chunks.push(eq(Players.ranking_id, ranking.data.id))

    const data = (
      await this.db.drizzle
        .select()
        .from(Players)
        .where(and(...where_chunks))
    )[0]
    if (!data) return
    return new Player(data, this.db)
  }

  async fetchMany({
    player_ids,
    allow_disabled = false,
    ranking_id,
  }: {
    player_ids?: number[]
    allow_disabled?: boolean
    ranking_id?: number
  } = {}): Promise<Player[]> {
    const where_chunks: SQL[] = []

    if (ranking_id) where_chunks.push(eq(Players.ranking_id, ranking_id))
    if (!allow_disabled) where_chunks.push(sql`(${Players.flags} & ${PlayerFlags.Disabled}) = 0`)
    if (player_ids) where_chunks.push(inArray(Players.id, player_ids))
    if (where_chunks.length === 0) throw new DbErrors.ValueError('No filters provided')

    const players = await this.db.drizzle
      .select()
      .from(Players)
      .where(and(...where_chunks))

    return players.map(item => {
      return new Player(item, this.db)
    })
  }

  /**
   * Update multiple players at once with the same data.
   */
  async setMany(ids: number[], data: PlayerUpdate) {
    await this.db.drizzle.update(Players).set(data).where(inArray(Players.id, ids))
  }

  /**
   * Update multiple players at once with ratings.
   */
  async updateRatings(data: { player: PartialPlayer; rating: Rating }[]) {
    this.db.cache.match_players.clear()
    this.db.cache.players.clear()
    this.db.cache.user_players.clear()

    if (data.length === 0) return

    const player_ids = `ARRAY[${data.map(p => p.player.data.id).join(',')}]`
    const ratings = `ARRAY[${data.map(p => `'${JSON.stringify(p.rating)}'`).join(',')}]::jsonb[]`

    const pg_dialect = new PgDialect()

    const query =
      `with values as (
      SELECT * 
        FROM UNNEST(
          ${player_ids},
          ${ratings}
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
