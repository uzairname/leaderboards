import { and, eq, sql } from 'drizzle-orm'
import { Ranking, Team, User } from '..'
import { DbClient } from '../../client'
import { DbErrors } from '../../errors'
import { DbObject, DbObjectManager } from '../../managers'
import { Players, QueueTeams, Rankings, TeamPlayers, Teams } from '../../schema'
import { PlayerInsert, PlayerSelect } from '../../types'

export class Player extends DbObject<PlayerSelect> {
  constructor(data: PlayerSelect, db: DbClient) {
    super(data, db)
    db.cache.players_by_id[data.id] = this
    db.cache.players[data.ranking_id] ??= {}
    db.cache.players[data.ranking_id][data.user_id] = this
  }

  async update(data: Partial<Omit<PlayerInsert, 'user_id' | 'ranking_id'>>): Promise<this> {
    this.data = (
      await this.db.db
        .update(Players)
        .set(data)
        .where(and(
          eq(Players.user_id, this.data.user_id), 
          eq(Players.ranking_id, this.data.ranking_id)
        ))
        .returning()
    )[0] // prettier-ignore
    return this
  }

  async teams(): Promise<Team[]> {
    const data = await this.db.db
      .select({ team: Teams })
      .from(TeamPlayers)
      .where(eq(TeamPlayers.player_id, this.data.id))
      .innerJoin(Teams, eq(Teams.id, TeamPlayers.team_id))

    return data.map(data => new Team(data.team, this.db))
  }

  get ranking(): Promise<Ranking> {
    return this.db.rankings.get(this.data.ranking_id)
  }

  async queueTeams(): Promise<{ team: Team; in_queue: boolean }[]> {
    const data = await this.db.db
      .select({ team: Teams, queue_team: QueueTeams })
      .from(Teams)
      .innerJoin(
        TeamPlayers,
        and(eq(TeamPlayers.team_id, Teams.id), eq(TeamPlayers.player_id, this.data.id)),
      )
      .leftJoin(QueueTeams, eq(QueueTeams.team_id, Teams.id))

    return data.map(data => ({ team: new Team(data.team, this.db), in_queue: !!data.queue_team }))
  }

  async removeTeamsFromQueue(): Promise<void> {
    await this.db.db.execute(
      sql`DELETE FROM ${QueueTeams}
      WHERE ${QueueTeams.team_id} IN (
        SELECT ${TeamPlayers.team_id} FROM ${TeamPlayers}
        INNER JOIN ${Teams} ON 
          ${Teams.id} = ${TeamPlayers.team_id} 
          AND ${TeamPlayers.player_id} = ${this.data.id}
      )`,
    )
  }
}

export class PartialPlayer extends Player {
  constructor(db: DbClient, id: number) {
    super(
      {
        id,
        user_id: '',
        ranking_id: 0,
        name: null,
        time_created: null,
        rating: null,
        rd: null,
        stats: null,
      },
      db,
    )
  }
}

export class PlayersManager extends DbObjectManager {
  // when creating, pass in user and ranking objects instead of ids
  async create(
    user: User,
    ranking: Ranking,
    data?: Omit<PlayerInsert, 'user_id' | 'ranking_id'>,
  ): Promise<Player> {
    const new_data = (
      await this.db.db
        .insert(Players)
        .values({ user_id: user.data.id, ranking_id: ranking.data.id, ...data })
        .returning()
    )[0]
    return new Player(new_data, this.db)
  }

  async get(user_id: string, ranking: number): Promise<Player | undefined> {
    const cached_player = this.db.cache.players[ranking]?.[user_id]
    if (cached_player) return cached_player

    const data = (
      await this.db.db
        .select()
        .from(Players)
        .where(and(eq(Players.user_id, user_id), eq(Players.ranking_id, ranking)))
    )[0]
    if (!data) return
    return new Player(data, this.db)
  }

  async getById(id: number): Promise<Player> {
    const cached_player = this.db.cache.players_by_id[id]
    if (cached_player) return cached_player

    const data = (await this.db.db.select().from(Players).where(eq(Players.id, id)))[0]
    if (!data) throw new DbErrors.NotFoundError(`Player ${id} doesn't exist`)
    return new Player(data, this.db)
  }

  async getByUser(user_id: string): Promise<Player[]> {
    const data = await this.db.db.select().from(Players).where(eq(Players.user_id, user_id))
    return data.map(data => new Player(data, this.db))
  }

  getPartial(id: number): PartialPlayer {
    return new PartialPlayer(this.db, id)
  }
}
