import { desc, eq, sql } from 'drizzle-orm'
import { SerialisableMatcherRegExps } from 'miniflare'
import { Match, Player } from '..'
import { getRegisterPlayer } from '../../../main/modules/players'
import { sentry } from '../../../request/sentry'
import { DbClient } from '../../client'
import { DbErrors } from '../../errors'
import { DbObject, DbObjectManager } from '../../managers'
import { Matches, Players, QueueTeams, Rankings, TeamPlayers, Teams } from '../../schema'
import { RankingInsert, RankingSelect, TeamSelect } from '../../types'

export class Ranking extends DbObject<Partial<RankingSelect> & { id: number }> {
  constructor(data: Partial<RankingSelect> & { id: number }, db: DbClient) {
    super(data, db)
    db.cache.rankings[data.id] = this
  }

  /**
   *
   * @returns The top players in this ranking, ordered by highest rating to lowest
   */
  async getOrderedTopPlayers(limit?: number): Promise<Player[]> {
    const query = this.db.db
      .select()
      .from(Players)
      .where(eq(Players.ranking_id, this.data.id))
      .orderBy(desc(Players.rating))

    if (limit) query.limit(limit)

    const players = await query

    return players.map(item => {
      return new Player(item, this.db)
    })
  }

  async queueTeams(): Promise<{ [team_id: number]: { player_ids: number[] } }> {
    const result = await this.db.db
      .select({ player: Players, team_id: TeamPlayers.team_id })
      .from(TeamPlayers)
      .innerJoin(QueueTeams, eq(TeamPlayers.team_id, QueueTeams.team_id))
      .innerJoin(Players, eq(TeamPlayers.player_id, Players.id))
      .where(eq(Players.ranking_id, this.data.id))

    const teams: { [team_id: number]: { player_ids: number[] } } = {}
    result.forEach(item => {
      if (!teams[item.team_id]) teams[item.team_id] = { player_ids: [] }
      teams[item.team_id].player_ids.push(item.player.id)
    })

    return teams
  }

  async update(data: RankingInsert): Promise<this> {
    this.data = (
      await this.db.db.update(Rankings).set(data).where(eq(Rankings.id, this.data.id)).returning()
    )[0]
    return this
  }

  async delete() {
    await this.db.db.delete(Rankings).where(eq(Rankings.id, this.data.id))
    delete this.db.cache.rankings[this.data.id]
  }
}

export class RankingsManager extends DbObjectManager {
  async create(data: RankingInsert): Promise<Ranking> {
    const new_data = (await this.db.db.insert(Rankings).values(data).returning())[0]
    return new Ranking(new_data, this.db)
  }

  async get(ranking_id: number): Promise<Ranking> {
    const cached_ranking = this.db.cache.rankings[ranking_id]
    if (cached_ranking) return cached_ranking

    const data = (await this.db.db.select().from(Rankings).where(eq(Rankings.id, ranking_id)))[0]
    if (!data) {
      throw new DbErrors.NotFoundError(`Ranking ${ranking_id} doesn't exist`)
    }
    return new Ranking(data, this.db)
  }

  partial(ranking_id: number): Ranking {
    return new Ranking({ id: ranking_id }, this.db)
  }
}
