import { and, eq, sql } from 'drizzle-orm'
import { Ranking, Team, User } from '..'
import { sentry } from '../../../request/sentry'
import { DbClient } from '../../client'
import { DbErrors } from '../../errors'
import { DbObject, DbObjectManager } from '../../managers'
import { Players, QueueTeams, Rankings, TeamPlayers, Teams } from '../../schema'
import { PlayerInsert, PlayerSelect } from '../../types'

export class Player extends DbObject<PlayerSelect> {
  constructor(data: PlayerSelect, db: DbClient) {
    super(data, db)
    sentry.debug(`Created player with id ${data.id}, rating ${data.rating}`)
    db.cache.players_by_id[data.id] = this
    db.cache.players[data.ranking_id] ??= {}
    db.cache.players[data.ranking_id][data.user_id] = this
  }

  async update(data: Partial<Omit<PlayerInsert, 'user_id' | 'ranking_id'>>): Promise<this> {
    this.data = (
      await this.db.db
        .update(Players)
        .set(data)
        .where(
          eq(Players.id, this.data.id),
        )
        .returning()
    )[0] // prettier-ignore
    sentry.debug(`Updated player ${this.data.id} rating to ${this.data.rating}`)
    return this
  }

  get ranking(): Promise<Ranking> {
    return this.db.rankings.get(this.data.ranking_id)
  }

  async teams(): Promise<{ team: Team; in_queue: boolean }[]> {
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

  async removeTeamsFromQueue(): Promise<number> {
    const result = await this.db.db
      .delete(QueueTeams)
      .where(
        sql`${QueueTeams.team_id} in (
      select ${TeamPlayers.team_id} from ${TeamPlayers}
      inner join ${Teams} on
        ${Teams.id} = ${TeamPlayers.team_id} 
        and ${TeamPlayers.player_id} = ${this.data.id}
      )`,
      )
      .returning()

    return result.length
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

  getPartial(id: number): Player {
    if (this.db.cache.players_by_id[id]) {
      // sentry.debug(`Using cached player ${id}. Rating is ${this.db.cache.players_by_id[id].data.rating}`)
      return this.db.cache.players_by_id[id]
    }
    return new Player(
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
      this.db,
    )
  }
}
